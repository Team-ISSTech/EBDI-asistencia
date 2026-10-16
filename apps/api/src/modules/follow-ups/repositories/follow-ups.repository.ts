import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { AbsenceCandidate, ContactRow, FollowUpDetail, FollowUpRow, NewContact, TicketChange } from '../follow-ups.types.js';

/** Se ejecuta dentro de la transacción, una vez por ticket creado. */
export type TicketHook = (executor: AuditExecutor, candidate: AbsenceCandidate, ticketId: number) => Promise<void>;

export interface FollowUpsRepository {
  /** Ausencias de jornadas matutinas desde `sinceDate` (YYYY-MM-DD) que aún no tienen ticket. */
  findAbsencesWithoutTicket(sinceDate: string): Promise<AbsenceCandidate[]>;
  /** Crea un ticket por candidato; los que ya tienen uno se omiten. Devuelve cuántos creó. */
  openTickets(candidates: readonly AbsenceCandidate[], now: Date, hook: TicketHook): Promise<number>;
  /** Tickets de la estancia que no están cerrados, los más antiguos primero. */
  listOpen(estanciaId: number): Promise<FollowUpRow[]>;
  findOne(id: number, estanciaId: number): Promise<FollowUpRow | null>;
  findDetail(id: number, estanciaId: number): Promise<FollowUpDetail | null>;
  /** Teléfono cifrado del tutor si está vinculado al infante; null si no lo está. */
  findGuardianPhone(childId: number, guardianId: number): Promise<{ readonly phoneEncrypted: Buffer | null } | null>;
  /** Inserta el intento, actualiza el ticket y ejecuta `hook`, en una sola transacción. Lanza CONFLICTO si el intento ya existe. */
  registerContact(
    followUpId: number,
    contact: NewContact,
    change: TicketChange,
    context: { readonly userId: number; readonly now: Date },
    hook: (executor: AuditExecutor, contactId: number) => Promise<void>,
  ): Promise<number>;
  listContacts(followUpId: number): Promise<ContactRow[]>;
}

export const FOLLOW_UPS_REPOSITORY = Symbol('FOLLOW_UPS_REPOSITORY');
