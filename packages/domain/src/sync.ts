/**
 * Operaciones que se capturan sin conexión y se envían al reconectar (RF-20 a
 * RF-23). Cada una lleva un UUID de operación: el servidor reconoce un reintento
 * y devuelve la misma respuesta sin repetir el efecto.
 */
export const SYNC_OPERATION_TYPES = ['ATTENDANCE_MARKS', 'FOLLOW_UP_CONTACT'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

/** Entidad que guarda `sincronizaciones.entidad` para cada tipo de operación. */
export const SYNC_ENTITIES = { ATTENDANCE_MARKS: 'ASISTENCIA', FOLLOW_UP_CONTACT: 'CONTACTO_SEGUIMIENTO' } as const satisfies Record<SyncOperationType, string>;

/** APLICADA: todo se escribió; PARCIAL: se aplicó lo válido y el resto se rechazó; RECHAZADA: no se aplicó nada. */
export const SYNC_RESULT_STATUSES = ['APLICADA', 'PARCIAL', 'RECHAZADA'] as const;
export type SyncResultStatus = (typeof SYNC_RESULT_STATUSES)[number];

export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 300_000;

/** Espera antes del reintento número `attempt` (1, 2, 3…): se duplica cada vez y topa en 5 minutos. */
export function nextRetryDelayMs(attempt: number): number {
  const safe = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1;
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (safe - 1));
}

/** Falla de red (sin estado) o del servidor: la operación se conserva y se reintenta. Un 4xx es un rechazo, no se reintenta solo. */
export function isTransientFailure(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500;
}
