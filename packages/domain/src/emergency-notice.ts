/**
 * RF-27: texto del aviso a los contactos de emergencia. Se manda por WhatsApp
 * como plantilla aprobada por Meta, así que debe registrarse tal cual. No
 * nombra al menor ni el motivo: el tercero solo sabe que la estancia lo busca.
 */
export const EMERGENCY_NOTICE_TEXT =
  'No lo logramos contactar por un problema de su estudiante asignado, por favor contáctenos a la brevedad dado que es un tema urgente.';

/** PENDIENTE: por enviar (o por reintentar); SIN_TELEFONO: el contacto no tiene número registrado. */
export const EMERGENCY_NOTICE_STATUSES = ['PENDIENTE', 'ENVIADO', 'FALLIDO', 'SIN_TELEFONO'] as const;
export type EmergencyNoticeStatus = (typeof EMERGENCY_NOTICE_STATUSES)[number];

export const MAX_NOTICE_ATTEMPTS = 3;
const RETRY_BASE_MINUTES = 5;
const MS_PER_MINUTE = 60_000;

export interface NoticeRetry {
  readonly status: Extract<EmergencyNoticeStatus, 'PENDIENTE' | 'FALLIDO'>;
  /** Cuándo volver a intentar; nulo si ya no hay más intentos. */
  readonly retryAt: Date | null;
}

/** Qué sigue tras un envío fallido: espera de 5, 10… minutos, y tras `MAX_NOTICE_ATTEMPTS` se da por fallido. */
export const afterFailedNotice = (attempts: number, now: Date): NoticeRetry =>
  attempts >= MAX_NOTICE_ATTEMPTS
    ? { status: 'FALLIDO', retryAt: null }
    : { status: 'PENDIENTE', retryAt: new Date(now.getTime() + RETRY_BASE_MINUTES * 2 ** (attempts - 1) * MS_PER_MINUTE) };
