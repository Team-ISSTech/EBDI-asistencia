import { Inject, Injectable } from '@nestjs/common';
import type { Contact, FollowUp, RegisterContactRequest } from '@sirai/contracts';
import { applyContact, isEmergencyAlert } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { ContactRow, FollowUpDetail, FollowUpRow } from '../follow-ups.types.js';
import { FOLLOW_UPS_REPOSITORY, type FollowUpsRepository } from '../repositories/follow-ups.repository.js';

const FOLLOW_UPS_TABLE = 'seguimientos';

export const FOLLOW_UPS_CLOCK = Symbol('FOLLOW_UPS_CLOCK');

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
  async registerContact(auth: AuthContext, followUpId: number, input: RegisterContactRequest, request: RequestContext): Promise<FollowUp> {
    const estanciaId = this.requireEstancia(auth);
    const current = await this.requireOpen(followUpId, estanciaId);
    const phone = await this.guardianPhone(current, input);
    const now = this.clock();
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
    const updated = await this.followUps.findOne(followUpId, estanciaId);
    if (!updated) throw new ApiError('NO_ENCONTRADO', 'Seguimiento no encontrado.');
    return toView(updated);
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
