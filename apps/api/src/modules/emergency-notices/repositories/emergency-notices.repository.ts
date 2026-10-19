import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { DueNotice, NoticeOutcome } from '../emergency-notices.types.js';

export interface EmergencyNoticesRepository {
  /**
   * Toma hasta `limit` avisos pendientes cuyo momento ya llegó y los reserva por
   * `leaseMs`: si el proceso se cae a media vuelta, o hay varias instancias de la
   * API, nadie más los envía durante ese plazo.
   */
  claimDue(now: Date, limit: number, leaseMs: number): Promise<DueNotice[]>;
  /** Guarda el resultado del intento y ejecuta `hook`, en una sola transacción. */
  settle(noticeId: number, outcome: NoticeOutcome, now: Date, hook: (executor: AuditExecutor) => Promise<void>): Promise<void>;
}

export const EMERGENCY_NOTICES_REPOSITORY = Symbol('EMERGENCY_NOTICES_REPOSITORY');
