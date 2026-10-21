import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { DayRecordRow, IncidentRow, NewDeparture, NewIncident, PickupLinkRow } from '../departures.types.js';

/** Se ejecuta dentro de la misma transacción que la escritura. */
export type WriteHook = (executor: AuditExecutor, id: number) => Promise<void>;

export interface DeparturesRepository {
  /** El infante de una inscripción activa de la estancia, o null si no pertenece a ella. */
  findChildId(estanciaId: number, enrollmentId: number): Promise<number | null>;
  findDayRecord(journeyId: number, enrollmentId: number): Promise<DayRecordRow | null>;
  /** Todos los vínculos del infante, también los vencidos o dados de baja: la regla decide. */
  listPickupLinks(childId: number): Promise<PickupLinkRow[]>;
  /** Registra la salida solo si aún no la tenía; devuelve false si otra petición se adelantó. */
  recordDeparture(departure: NewDeparture, hook: WriteHook): Promise<boolean>;
  createIncident(incident: NewIncident, hook: WriteHook): Promise<number>;
  listIncidents(recordId: number): Promise<IncidentRow[]>;
}

export const DEPARTURES_REPOSITORY = Symbol('DEPARTURES_REPOSITORY');
