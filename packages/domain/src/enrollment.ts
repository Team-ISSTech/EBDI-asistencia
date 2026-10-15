import type { EnrollmentMovement, EnrollmentStatus } from './catalogs.js';

export type EnrollmentTransition =
  | { readonly ok: true; readonly status: EnrollmentStatus }
  | { readonly ok: false; readonly reason: 'INSCRIPCION_NO_ACTIVA' | 'MOVIMIENTO_INVALIDO' };

const STATUS_AFTER: Partial<Record<EnrollmentMovement, EnrollmentStatus>> = {
  CAMBIO_SALA: 'ACTIVA',
  TRASLADO: 'TRASLADADA',
  BAJA: 'BAJA',
};

/**
 * Estado de una inscripción tras un movimiento. Solo las activas se mueven;
 * un reingreso es una inscripción nueva (ALTA), no una transición.
 */
export function nextEnrollmentStatus(current: EnrollmentStatus, movement: EnrollmentMovement): EnrollmentTransition {
  if (current !== 'ACTIVA') return { ok: false, reason: 'INSCRIPCION_NO_ACTIVA' };
  const status = STATUS_AFTER[movement];
  return status ? { ok: true, status } : { ok: false, reason: 'MOVIMIENTO_INVALIDO' };
}

const MONTHS_PER_YEAR = 12;
const MONTH_FORMAT = /^(\d{4})-(\d{2})-(\d{2})/;

const parts = (isoDate: string): [number, number, number] => {
  const match = MONTH_FORMAT.exec(isoDate);
  if (!match) throw new Error(`Fecha inválida: ${isoDate}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

/** Meses cumplidos entre una fecha de nacimiento y otra fecha (`YYYY-MM-DD`). */
export function ageInMonths(birthDate: string, onDate: string): number {
  const [by, bm, bd] = parts(birthDate);
  const [oy, om, od] = parts(onDate);
  const months = (oy - by) * MONTHS_PER_YEAR + (om - bm) - (od < bd ? 1 : 0);
  return Math.max(0, months);
}

export interface RoomAgeRange {
  readonly minMonths: number | null;
  readonly maxMonths: number | null;
}

/** Un límite nulo significa que la sala no restringe por ese lado. */
export const fitsRoomAge = (months: number, range: RoomAgeRange): boolean =>
  (range.minMonths === null || months >= range.minMonths) && (range.maxMonths === null || months <= range.maxMonths);
