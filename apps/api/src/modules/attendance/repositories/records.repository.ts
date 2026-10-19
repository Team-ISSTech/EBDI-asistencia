import type { Shift } from '@sirai/domain';
import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { AppliedMark, EnrollmentForMarking, ExistingMark, MarkChange, RosterRow } from '../records.types.js';

/** Se ejecuta dentro de la transacción, una sola vez, con todos los cambios y el id de su registro. */
export type MarkChangeHook = (executor: AuditExecutor, applied: readonly AppliedMark[]) => Promise<void>;

export interface AttendanceRecordsRepository {
  /** Infantes con inscripción activa en la estancia y sala del turno de la jornada. */
  listRoster(estanciaId: number, journeyId: number, shift: Shift): Promise<RosterRow[]>;
  /** Solo devuelve las inscripciones activas de la estancia; las demás se omiten. */
  findEnrollments(estanciaId: number, enrollmentIds: readonly number[]): Promise<EnrollmentForMarking[]>;
  /** De las inscripciones dadas, las de infantes con candado médico activo (caso abierto que requiere alta y no la tiene). */
  findLockedEnrollmentIds(estanciaId: number, enrollmentIds: readonly number[]): Promise<Set<number>>;
  findMarks(journeyId: number, enrollmentIds: readonly number[]): Promise<ExistingMark[]>;
  /** Identificadores de operación ya aplicados, para reconocer reintentos. */
  findAppliedClientIds(clientIds: readonly string[]): Promise<Set<string>>;
  /** Crea o cambia todos los registros, y ejecuta `hook` con todos, en una sola transacción y con una sentencia por tipo de cambio. */
  applyChanges(journeyId: number, userId: number, now: Date, changes: readonly MarkChange[], hook: MarkChangeHook): Promise<void>;
}

export const ATTENDANCE_RECORDS_REPOSITORY = Symbol('ATTENDANCE_RECORDS_REPOSITORY');
