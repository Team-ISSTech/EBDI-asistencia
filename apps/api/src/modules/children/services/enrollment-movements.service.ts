import { Inject, Injectable } from '@nestjs/common';
import type { EnrollmentMovementRequest, PendingTransfer, ReceiveTransferRequest, TransferDestination } from '@sirai/contracts';
import { nextEnrollmentStatus } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import type { EnrollmentRecord, MovementRecord, PendingTransferRecord } from '../children.types';
import { CHILDREN_REPOSITORY, type ChildrenRepository } from '../repositories/children.repository';
import { ENROLLMENTS_REPOSITORY, type EnrollmentsRepository } from '../repositories/enrollments.repository';
import { CLOCK } from './children.service';
import { requireRoomThatAccepts } from './room-admission';

const CHILDREN_TABLE = 'infantes';

type Move<T extends EnrollmentMovementRequest['type']> = Extract<EnrollmentMovementRequest, { type: T }>;

const toPendingView = (record: PendingTransferRecord): PendingTransfer => ({
  enrollmentId: record.enrollmentId,
  childName: record.childName,
  enrollmentNumber: record.enrollmentNumber,
  birthDate: record.birthDate,
  fromEstanciaName: record.fromEstanciaName,
  movedAt: record.movedAt.toISOString(),
  reason: record.reason,
});

/**
 * Movimientos de la inscripción (RF-35): cambio de sala, baja y traslado, y la
 * recepción del traslado en la estancia de destino. Cada movimiento deja su
 * renglón en la bitácora de movimientos y su auditoría en la misma transacción.
 */
@Injectable()
export class EnrollmentMovementsService {
  constructor(
    @Inject(CHILDREN_REPOSITORY) private readonly children: ChildrenRepository,
    @Inject(ENROLLMENTS_REPOSITORY) private readonly enrollments: EnrollmentsRepository,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  async move(auth: AuthContext, childId: number, input: EnrollmentMovementRequest, request: RequestContext): Promise<void> {
    const estanciaId = this.requireEstancia(auth);
    const enrollment = await this.enrollments.findActive(childId, estanciaId);
    if (!enrollment) throw new ApiError('NO_ENCONTRADO', 'Infante no encontrado.');
    this.assertTransition(enrollment, input.type);
    if (input.type === 'CAMBIO_SALA') return this.changeRoom(auth, enrollment, input, request);
    if (input.type === 'BAJA') return this.retire(auth, enrollment, input, request);
    return this.transfer(auth, enrollment, input, request);
  }

  async destinations(auth: AuthContext): Promise<TransferDestination[]> {
    return this.enrollments.listTransferDestinations(this.requireEstancia(auth));
  }

  /** Los traslados llevan nombres de menores: consultarlos se audita. */
  async pendingTransfers(auth: AuthContext, request: RequestContext): Promise<PendingTransfer[]> {
    const records = await this.enrollments.listPendingTransfers(this.requireEstancia(auth));
    await this.audit.record({ ...this.actor(auth), action: 'TRASLADOS_CONSULTADOS', tableName: CHILDREN_TABLE, recordId: null, request });
    return records.map(toPendingView);
  }

  async receive(auth: AuthContext, enrollmentId: number, input: ReceiveTransferRequest, request: RequestContext): Promise<void> {
    const estanciaId = this.requireEstancia(auth);
    const transfer = await this.enrollments.findPendingTransfer(enrollmentId, estanciaId);
    if (!transfer) throw new ApiError('NO_ENCONTRADO', 'Traslado no encontrado.');
    const now = this.clock();
    const room = await requireRoomThatAccepts(this.children, { estanciaId, roomId: input.roomId, birthDate: transfer.birthDate, on: now });
    const schoolYearId = await this.children.findActiveSchoolYearId();
    if (schoolYearId === null) throw new ApiError('CONFLICTO', 'No hay un ciclo escolar activo.');
    await this.enrollments.receiveTransfer(transfer, { estanciaId, roomId: room.id, schoolYearId }, auth.userId, now, (tx) =>
      this.audit.record(
        { ...this.actor(auth), action: 'TRASLADO_RECIBIDO', tableName: CHILDREN_TABLE, recordId: String(transfer.childId), after: { fromEstanciaId: transfer.fromEstanciaId, roomId: room.id }, request },
        tx,
      ),
    );
  }

  private async changeRoom(auth: AuthContext, enrollment: EnrollmentRecord, input: Move<'CAMBIO_SALA'>, request: RequestContext): Promise<void> {
    if (input.roomId === enrollment.roomId) throw new ApiError('CONFLICTO', 'El infante ya está en esa sala.');
    const child = await this.children.findChild(enrollment.childId, enrollment.estanciaId);
    const now = this.clock();
    const room = await requireRoomThatAccepts(this.children, { estanciaId: enrollment.estanciaId, roomId: input.roomId, birthDate: child?.birthDate ?? '', on: now });
    const movement = this.movement('CAMBIO_SALA', enrollment, { newEstanciaId: enrollment.estanciaId, newRoomId: room.id, reason: input.reason });
    await this.enrollments.changeRoom(enrollment, movement, auth.userId, now, (tx) =>
      this.audit.record(
        { ...this.actor(auth), action: 'INSCRIPCION_SALA_CAMBIADA', tableName: CHILDREN_TABLE, recordId: String(enrollment.childId), before: { roomId: enrollment.roomId }, after: { roomId: room.id, reason: input.reason }, request },
        tx,
      ),
    );
  }

  private async retire(auth: AuthContext, enrollment: EnrollmentRecord, input: Move<'BAJA'>, request: RequestContext): Promise<void> {
    const movement = this.movement('BAJA', enrollment, { reason: input.reason });
    await this.enrollments.finish(enrollment, 'BAJA', movement, auth.userId, this.clock(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'INSCRIPCION_BAJA', tableName: CHILDREN_TABLE, recordId: String(enrollment.childId), after: { reason: input.reason }, request }, tx),
    );
  }

  private async transfer(auth: AuthContext, enrollment: EnrollmentRecord, input: Move<'TRASLADO'>, request: RequestContext): Promise<void> {
    const destination = input.destinationEstanciaId;
    if (destination === enrollment.estanciaId || !(await this.enrollments.isEstanciaActive(destination))) {
      throw new ApiError('DATOS_INVALIDOS', 'La estancia de destino no es válida.');
    }
    const movement = this.movement('TRASLADO', enrollment, { newEstanciaId: destination, reason: input.reason });
    await this.enrollments.finish(enrollment, 'TRASLADADA', movement, auth.userId, this.clock(), (tx) =>
      this.audit.record(
        { ...this.actor(auth), action: 'TRASLADO_SOLICITADO', tableName: CHILDREN_TABLE, recordId: String(enrollment.childId), after: { destinationEstanciaId: destination, reason: input.reason }, request },
        tx,
      ),
    );
  }

  private movement(type: MovementRecord['type'], enrollment: EnrollmentRecord, change: Partial<MovementRecord>): MovementRecord {
    return {
      type,
      previousEstanciaId: enrollment.estanciaId,
      newEstanciaId: null,
      previousRoomId: enrollment.roomId,
      newRoomId: null,
      reason: null,
      ...change,
    };
  }

  private assertTransition(enrollment: EnrollmentRecord, type: EnrollmentMovementRequest['type']): void {
    const next = nextEnrollmentStatus(enrollment.status, type);
    if (next.ok) return;
    throw new ApiError(next.reason === 'INSCRIPCION_NO_ACTIVA' ? 'CONFLICTO' : 'DATOS_INVALIDOS', 'La inscripción no admite ese movimiento.');
  }

  private requireEstancia(auth: AuthContext): number {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia para continuar.');
    return auth.activeEstanciaId;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }
}
