import { Inject, Injectable } from '@nestjs/common';
import type { Contact, FollowUp, RegisterContactRequest, RegisterMedicalReleaseRequest } from '@sirai/contracts';
import { applyContact, canClose, canRegisterRelease, type CloseCheck, isEmergencyAlert, type ReleaseCheck } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { ContactRow, FollowUpDetail, FollowUpRow } from '../follow-ups.types.js';
import { FOLLOW_UPS_REPOSITORY, type FollowUpsRepository } from '../repositories/follow-ups.repository.js';

const FOLLOW_UPS_TABLE = 'seguimientos';
const DATE_LENGTH = 10;

const RELEASE_MESSAGES: Record<Exclude<ReleaseCheck, { ok: true }>['reason'], string> = {
  YA_CERRADO: 'El seguimiento ya está cerrado.',
  NO_REQUIERE_ALTA: 'Este caso no requiere alta médica.',
  YA_LIBERADO: 'El alta médica de este caso ya está registrada.',
};

const CLOSE_MESSAGES: Record<Exclude<CloseCheck, { ok: true }>['reason'], string> = {
  YA_CERRADO: 'El seguimiento ya está cerrado.',
  SIN_CONTACTO: 'Registra al menos una llamada al tutor antes de cerrar el seguimiento.',
  SIN_CLASIFICAR: 'Clasifica la causa de la ausencia antes de cerrar el seguimiento.',
  FALTA_ALTA_MEDICA: 'El caso requiere el alta médica del médico de estancia antes de cerrarse.',
};

export const FOLLOW_UPS_CLOCK = Symbol('FOLLOW_UPS_CLOCK');

/** Datos de una llamada capturada sin conexión: su UUID de operación y la hora en que se hizo. */
export interface ContactOrigin {
  readonly operationId?: string;
  readonly at?: Date;
}

const toView = (row: FollowUpRow): FollowUp => ({
  id: row.id,
  childId: row.childId,
  childName: row.childName,
  enrollmentNumber: row.enrollmentNumber,
  roomName: row.roomName,
  absenceDate: row.absenceDate,
  absenceStatus: row.absenceStatus,
  status: row.status,
  cause: row.cause,
  expectedReturnDate: row.expectedReturnDate,
  requiresMedicalRelease: row.requiresMedicalRelease,
  medicalReleased: row.medicalReleased,
  attemptCount: row.attemptCount,
  nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
  emergencyAlert: isEmergencyAlert(row.cause, row.failedAttempts),
  openedAt: row.openedAt.toISOString(),
});

/** Bandeja de seguimientos y registro de contactos con el tutor de la estancia activa. */
@Injectable()
export class FollowUpsService {
  constructor(
    @Inject(FOLLOW_UPS_REPOSITORY) private readonly followUps: FollowUpsRepository,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
    @Inject(FOLLOW_UPS_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Bandeja de la estancia activa. Muestra nombres de menores: la lectura se audita. */
  async list(auth: AuthContext, request: RequestContext): Promise<FollowUp[]> {
    const rows = await this.followUps.listOpen(this.requireEstancia(auth));
    await this.audit.record({ ...this.actor(auth), action: 'SEGUIMIENTOS_CONSULTADOS', tableName: FOLLOW_UPS_TABLE, recordId: null, request });
    return rows.map(toView);
  }

  /**
   * Registra un intento de contacto y su efecto sobre el ticket (clasificación,
   * fecha de retorno, candado médico, segundo intento) en una sola transacción.
   */
  async registerContact(auth: AuthContext, followUpId: number, input: RegisterContactRequest, request: RequestContext, origin: ContactOrigin = {}): Promise<FollowUp> {
    const estanciaId = this.requireEstancia(auth);
    if (origin.operationId && (await this.followUps.findContactOperation(origin.operationId)) === followUpId) {
      return this.requireView(followUpId, estanciaId);
    }
    const current = await this.requireOpen(followUpId, estanciaId);
    const phone = await this.guardianPhone(current, input);
    const serverNow = this.clock();
    const now = origin.at ? new Date(Math.min(origin.at.getTime(), serverNow.getTime())) : serverNow;
    const outcome = applyContact(
      { cause: current.cause, requiresMedicalRelease: current.requiresMedicalRelease, expectedReturnDate: current.expectedReturnDate, failedAttempts: current.failedAttempts },
      input.result === 'CONTACTADO' ? { result: input.result, cause: input.cause, expectedReturnDate: input.expectedReturnDate, at: now } : { result: input.result, at: now },
    );
    if (!outcome.ok) throw new ApiError('DATOS_INVALIDOS', 'El contacto no tiene los datos que exige su resultado.');
    const { state } = outcome;
    const attemptNumber = current.attemptCount + 1;
    await this.followUps.registerContact(
      followUpId,
      {
        attemptNumber,
        guardianId: input.guardianId ?? null,
        result: input.result,
        phoneEncrypted: phone,
        notesEncrypted: input.notes === undefined ? null : this.encryption.encrypt(input.notes),
        nextAttemptAt: state.nextAttemptAt,
        operationId: origin.operationId ?? null,
      },
      { status: state.status, cause: state.cause, requiresMedicalRelease: state.requiresMedicalRelease, expectedReturnDate: state.expectedReturnDate },
      { userId: auth.userId, now },
      (tx) =>
        this.audit.record(
          {
            ...this.actor(auth),
            action: 'CONTACTO_REGISTRADO',
            tableName: FOLLOW_UPS_TABLE,
            recordId: String(followUpId),
            before: { status: current.status, cause: current.cause, requiresMedicalRelease: current.requiresMedicalRelease },
            after: { status: state.status, cause: state.cause, requiresMedicalRelease: state.requiresMedicalRelease, attemptNumber, result: input.result },
            request,
          },
          tx,
        ),
    );
    return this.requireView(followUpId, estanciaId);
  }

  /** Historial con las notas descifradas: es una lectura de datos sensibles y se audita. */
  async listContacts(auth: AuthContext, followUpId: number, request: RequestContext): Promise<Contact[]> {
    await this.requireTicket(followUpId, this.requireEstancia(auth));
    const rows = await this.followUps.listContacts(followUpId);
    await this.audit.record({ ...this.actor(auth), action: 'NOTAS_SEGUIMIENTO_CONSULTADAS', tableName: FOLLOW_UPS_TABLE, recordId: String(followUpId), request });
    return rows.map((row: ContactRow) => ({
      id: row.id,
      attemptNumber: row.attemptNumber,
      occurredAt: row.occurredAt.toISOString(),
      result: row.result,
      guardianId: row.guardianId,
      notes: row.notesEncrypted === null ? null : this.encryption.decrypt(row.notesEncrypted),
      nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    }));
  }

  /**
   * RF-30: el alta médica libera el candado. La observación es un dato de
   * salud: se guarda cifrada y no entra a la bitácora.
   */
  async registerRelease(auth: AuthContext, followUpId: number, input: RegisterMedicalReleaseRequest, request: RequestContext): Promise<FollowUp> {
    const estanciaId = this.requireEstancia(auth);
    const current = await this.requireTicket(followUpId, estanciaId);
    const check = canRegisterRelease({ status: current.status, requiresMedicalRelease: current.requiresMedicalRelease, released: current.released });
    if (!check.ok) throw new ApiError('CONFLICTO', RELEASE_MESSAGES[check.reason]);
    const now = this.clock();
    if (input.dischargeDate > now.toISOString().slice(0, DATE_LENGTH)) throw new ApiError('DATOS_INVALIDOS', 'La fecha del alta no puede ser futura.');
    await this.followUps.registerRelease(
      followUpId,
      { dischargeDate: input.dischargeDate, folio: input.folio ?? null, observationsEncrypted: input.observations === undefined ? null : this.encryption.encrypt(input.observations) },
      { userId: auth.userId, now },
      (tx) =>
        this.audit.record(
          {
            ...this.actor(auth),
            action: 'ALTA_MEDICA_REGISTRADA',
            tableName: FOLLOW_UPS_TABLE,
            recordId: String(followUpId),
            before: { medicalLock: true },
            after: { medicalLock: false, dischargeDate: input.dischargeDate, folio: input.folio ?? null },
            request,
          },
          tx,
        ),
    );
    return this.requireView(followUpId, estanciaId);
  }

  /** Cierra el caso si ya se llamó al tutor, se clasificó la causa y, de haber candado, hay alta (RF-25, RF-26, RF-30). */
  async close(auth: AuthContext, followUpId: number, request: RequestContext): Promise<FollowUp> {
    const estanciaId = this.requireEstancia(auth);
    const current = await this.requireTicket(followUpId, estanciaId);
    const check = canClose({
      status: current.status,
      cause: current.cause,
      attemptCount: current.attemptCount,
      requiresMedicalRelease: current.requiresMedicalRelease,
      released: current.released,
    });
    if (!check.ok) throw new ApiError('CONFLICTO', CLOSE_MESSAGES[check.reason]);
    await this.followUps.closeTicket(followUpId, this.clock(), (tx) =>
      this.audit.record(
        { ...this.actor(auth), action: 'SEGUIMIENTO_CERRADO', tableName: FOLLOW_UPS_TABLE, recordId: String(followUpId), before: { status: current.status }, after: { status: 'CERRADO' }, request },
        tx,
      ),
    );
    return this.requireView(followUpId, estanciaId);
  }

  private async requireView(id: number, estanciaId: number): Promise<FollowUp> {
    const row = await this.followUps.findOne(id, estanciaId);
    if (!row) throw new ApiError('NO_ENCONTRADO', 'Seguimiento no encontrado.');
    return toView(row);
  }

  /** El teléfono marcado se copia cifrado del tutor; el tutor debe estar vinculado al infante. */
  private async guardianPhone(ticket: FollowUpDetail, input: RegisterContactRequest): Promise<Buffer | null> {
    if (input.guardianId === undefined) return null;
    const link = await this.followUps.findGuardianPhone(ticket.childId, input.guardianId);
    if (!link) throw new ApiError('DATOS_INVALIDOS', 'El tutor no está vinculado a este infante.');
    return link.phoneEncrypted;
  }

  private async requireTicket(id: number, estanciaId: number): Promise<FollowUpDetail> {
    const ticket = await this.followUps.findDetail(id, estanciaId);
    if (!ticket) throw new ApiError('NO_ENCONTRADO', 'Seguimiento no encontrado.');
    return ticket;
  }

  private async requireOpen(id: number, estanciaId: number): Promise<FollowUpDetail> {
    const ticket = await this.requireTicket(id, estanciaId);
    if (ticket.status === 'CERRADO') throw new ApiError('CONFLICTO', 'El seguimiento ya está cerrado.');
    return ticket;
  }

  private requireEstancia(auth: AuthContext): number {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia activa.');
    return auth.activeEstanciaId;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: auth.principal.assignments.map((assignment) => assignment.role).sort().join(',') || null };
  }
}
