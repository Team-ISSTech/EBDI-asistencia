import type { AttendanceStatus } from './attendance.js';

/** Cómo se captura el registro: a mano o leyendo el código de la credencial. */
export const ATTENDANCE_METHODS = ['MANUAL', 'QR'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

export type MarkPlan = 'CREATE' | 'CHANGE' | 'UNCHANGED';

/**
 * Qué hacer con una marca de asistencia. Un reintento o un doble toque con el
 * mismo estado no cambia nada (ni se audita); un estado distinto es un cambio,
 * que sí se audita con el antes y el después.
 */
export function planMark(existing: { readonly status: AttendanceStatus } | null, incoming: AttendanceStatus): MarkPlan {
  if (existing === null) return 'CREATE';
  return existing.status === incoming ? 'UNCHANGED' : 'CHANGE';
}
