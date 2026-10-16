import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { can, type PermissionCode } from '@sirai/auth';
import type { SyncOperation, SyncRequest, SyncResponse, SyncResult } from '@sirai/contracts';
import { SYNC_ENTITIES, type SyncResultStatus } from '@sirai/domain';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import { canonicalJson } from '../../../common/util/canonical-json.js';
import { AttendanceRecordsService } from '../../attendance/services/records.service.js';
import { FollowUpsService } from '../../follow-ups/services/follow-ups.service.js';
import { SYNC_REPOSITORY, type SyncRepository } from '../repositories/sync.repository.js';
import type { StoredOperation } from '../sync.types.js';

const REQUIRED_PERMISSION: Readonly<Record<SyncOperation['type'], PermissionCode>> = {
  ATTENDANCE_MARKS: 'ASISTENCIA_REGISTRAR',
  FOLLOW_UP_CONTACT: 'SEGUIMIENTO_REGISTRAR',
};

const rejected = (operationId: string, code: string, message: string): SyncResult => ({ operationId, status: 'RECHAZADA', replayed: false, saved: 0, unchanged: 0, rejections: [], code, message });

/** Huella del contenido de la operación: tipo y carga. La hora de captura no cuenta. */
const fingerprint = (operation: SyncOperation): Buffer => createHash('sha256').update(canonicalJson({ type: operation.type, payload: operation.payload })).digest();

/**
 * Recibe las operaciones capturadas sin conexión y las aplica en orden (RF-21).
 * Cada una lleva un UUID: la primera vez se ejecuta y se guarda su acuse; un
 * reintento recibe ese mismo acuse sin repetir el efecto (RF-22). Un rechazo del
 * dominio se guarda y se informa, pero no detiene el resto del lote. Una falla
 * inesperada no se guarda: la operación se podrá reintentar sin perderse (RF-23).
 */
@Injectable()
export class SyncService {
  constructor(
    @Inject(SYNC_REPOSITORY) private readonly sync: SyncRepository,
    private readonly attendance: AttendanceRecordsService,
    private readonly followUps: FollowUpsService,
  ) {}

  async process(auth: AuthContext, input: SyncRequest, request: RequestContext): Promise<SyncResponse> {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia activa.');
    const results: SyncResult[] = [];
    for (const operation of input.operations) results.push(await this.processOne(auth, auth.activeEstanciaId, operation, request));
    return { results };
  }

  private async processOne(auth: AuthContext, estanciaId: number, operation: SyncOperation, request: RequestContext): Promise<SyncResult> {
    const payloadSha256 = fingerprint(operation);
    const stored = await this.sync.find(operation.operationId);
    if (stored) return this.replay(stored, auth, estanciaId, payloadSha256);
    const result = await this.execute(auth, operation, request);
    const saved = await this.sync.save(this.toStored(auth, estanciaId, operation, payloadSha256, result));
    if (saved) return result;
    const winner = await this.sync.find(operation.operationId);
    return winner ? this.replay(winner, auth, estanciaId, payloadSha256) : result;
  }

  /** El acuse solo se devuelve a quien envió la operación y con el mismo contenido. */
  private replay(stored: StoredOperation, auth: AuthContext, estanciaId: number, payloadSha256: Buffer): SyncResult {
    const sameOwner = stored.userId === auth.userId && stored.estanciaId === estanciaId && stored.payloadSha256.equals(payloadSha256);
    if (!sameOwner) return rejected(stored.operationId, 'OPERACION_REUTILIZADA', 'Ese identificador de operación ya se usó con otro contenido.');
    return { ...stored.response, replayed: true };
  }

  private async execute(auth: AuthContext, operation: SyncOperation, request: RequestContext): Promise<SyncResult> {
    if (!can(auth.principal, REQUIRED_PERMISSION[operation.type], { estanciaId: auth.activeEstanciaId })) {
      return rejected(operation.operationId, 'SIN_PERMISO', 'No tienes permiso para esta operación en la estancia activa.');
    }
    try {
      return operation.type === 'ATTENDANCE_MARKS' ? await this.applyMarks(auth, operation, request) : await this.applyContact(auth, operation, request);
    } catch (error) {
      if (error instanceof ApiError) return rejected(operation.operationId, error.code, error.message);
      throw error;
    }
  }

  private async applyMarks(auth: AuthContext, operation: Extract<SyncOperation, { type: 'ATTENDANCE_MARKS' }>, request: RequestContext): Promise<SyncResult> {
    const { saved, unchanged, rejections } = await this.attendance.markPartial(auth, operation.payload.journeyId, { marks: operation.payload.marks }, new Date(operation.capturedAt), request);
    const status: SyncResultStatus = rejections.length === 0 ? 'APLICADA' : saved + unchanged > 0 ? 'PARCIAL' : 'RECHAZADA';
    const code = status === 'RECHAZADA' ? 'SIN_MARCAS_VALIDAS' : null;
    const message = status === 'RECHAZADA' ? 'Ninguna marca de la operación se pudo aplicar.' : null;
    return { operationId: operation.operationId, status, replayed: false, saved, unchanged, rejections: [...rejections], code, message };
  }

  private async applyContact(auth: AuthContext, operation: Extract<SyncOperation, { type: 'FOLLOW_UP_CONTACT' }>, request: RequestContext): Promise<SyncResult> {
    await this.followUps.registerContact(auth, operation.payload.followUpId, operation.payload.contact, request, { operationId: operation.operationId, at: new Date(operation.capturedAt) });
    return { operationId: operation.operationId, status: 'APLICADA', replayed: false, saved: 1, unchanged: 0, rejections: [], code: null, message: null };
  }

  private toStored(auth: AuthContext, estanciaId: number, operation: SyncOperation, payloadSha256: Buffer, result: SyncResult): StoredOperation {
    return {
      operationId: operation.operationId,
      userId: auth.userId,
      estanciaId,
      entity: SYNC_ENTITIES[operation.type],
      capturedAt: new Date(operation.capturedAt),
      receivedAt: new Date(),
      status: result.status,
      payloadSha256,
      errorMessage: result.message,
      response: result,
    };
  }
}
