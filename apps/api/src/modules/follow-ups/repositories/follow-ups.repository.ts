import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { AbsenceCandidate, FollowUpRow } from '../follow-ups.types.js';

/** Se ejecuta dentro de la transacción, una vez por ticket creado. */
export type TicketHook = (executor: AuditExecutor, candidate: AbsenceCandidate, ticketId: number) => Promise<void>;

export interface FollowUpsRepository {
  /** Ausencias de jornadas matutinas desde `sinceDate` (YYYY-MM-DD) que aún no tienen ticket. */
  findAbsencesWithoutTicket(sinceDate: string): Promise<AbsenceCandidate[]>;
  /** Crea un ticket por candidato; los que ya tienen uno se omiten. Devuelve cuántos creó. */
  openTickets(candidates: readonly AbsenceCandidate[], now: Date, hook: TicketHook): Promise<number>;
  /** Tickets de la estancia que no están cerrados, los más antiguos primero. */
  listOpen(estanciaId: number): Promise<FollowUpRow[]>;
}

export const FOLLOW_UPS_REPOSITORY = Symbol('FOLLOW_UPS_REPOSITORY');
