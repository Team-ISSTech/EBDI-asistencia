import type { AttendanceStatus } from './attendance.js';

/**
 * Salida e incidencias del día (supuesto S-27, por confirmar con el cliente).
 * La salida solo la hace un tutor vinculado, vigente y autorizado a recoger
 * (RF-34); las credenciales de tutores siguen pendientes (S-22).
 */
export const INCIDENT_TYPES = ['ACCIDENTE', 'ENFERMEDAD', 'CONDUCTA', 'OTRA'] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

/** Largo máximo de la descripción de una incidencia. */
export const MAX_INCIDENT_DESCRIPTION = 1000;

export interface PickupLink {
  readonly canPickUp: boolean;
  /** `YYYY-MM-DD`. */
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly linkDeleted: boolean;
  readonly guardianActive: boolean;
}

/** El registro de asistencia del infante en la jornada, si existe. */
export interface DayRecord {
  readonly status: AttendanceStatus;
  readonly leftAt: Date | null;
}

export type DepartureBlocker = 'SIN_INGRESO' | 'YA_SALIO';

/** `today` en `YYYY-MM-DD`; las fechas de vigencia se comparan como texto. */
export const isAuthorizedPickup = (link: PickupLink, today: string): boolean =>
  link.canPickUp && !link.linkDeleted && link.guardianActive && link.validFrom <= today && (link.validUntil === null || link.validUntil >= today);

const entered = (record: DayRecord | null): record is DayRecord => record?.status === 'PRESENTE';

export function departureBlocker(record: DayRecord | null): DepartureBlocker | null {
  if (!entered(record)) return 'SIN_INGRESO';
  return record.leftAt === null ? null : 'YA_SALIO';
}

/** Una incidencia pertenece a un día en que el infante estuvo en la estancia, aunque ya haya salido. */
export const incidentBlocker = (record: DayRecord | null): 'SIN_INGRESO' | null => (entered(record) ? null : 'SIN_INGRESO');

/** Con la salida registrada, la asistencia del día ya no cambia de estado. */
export const markBlockedByDeparture = (record: DayRecord | null, next: AttendanceStatus): boolean =>
  record !== null && record.leftAt !== null && record.status !== next;
