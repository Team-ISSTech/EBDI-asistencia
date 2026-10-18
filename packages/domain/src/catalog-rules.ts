/** Zona horaria IANA válida (por ejemplo America/Mexico_City). Define cuándo es el cierre de las 09:00 de la estancia. */
export function isValidTimeZone(value: string): boolean {
  if (value.trim() === '' || !value.includes('/') && value !== 'UTC') return false;
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Una sala con inscritos activos no se desactiva ni se da de baja. */
export const canRetireRoom = (activeEnrollments: number): boolean => activeEnrollments === 0;

/** Las jornadas son por turno: cambiar el de una sala con inscritos descuadraría su historial. */
export const canChangeRoomShift = (activeEnrollments: number): boolean => activeEnrollments === 0;

/** La capacidad nueva no puede quedar por debajo de los inscritos; nula significa sin límite. */
export const roomCapacityAllows = (capacity: number | null, activeEnrollments: number): boolean => capacity === null || capacity >= activeEnrollments;

/** ¿Cabe otra inscripción? Sin capacidad definida siempre cabe. */
export const roomHasSpace = (capacity: number | null, activeEnrollments: number): boolean => capacity === null || activeEnrollments < capacity;

export interface EstanciaUsage {
  readonly activeEnrollments: number;
  readonly openJourneys: number;
}

export type RetireEstanciaCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'CON_INSCRITOS' | 'CON_JORNADAS_ABIERTAS' };

/** Una estancia solo se da de baja sin inscritos activos ni jornadas abiertas. */
export function canRetireEstancia(usage: EstanciaUsage): RetireEstanciaCheck {
  if (usage.activeEnrollments > 0) return { ok: false, reason: 'CON_INSCRITOS' };
  if (usage.openJourneys > 0) return { ok: false, reason: 'CON_JORNADAS_ABIERTAS' };
  return { ok: true };
}
