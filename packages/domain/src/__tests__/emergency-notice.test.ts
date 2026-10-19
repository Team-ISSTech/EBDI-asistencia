import { describe, expect, it } from 'vitest';
import { EMERGENCY_NOTICE_STATUSES, EMERGENCY_NOTICE_TEXT, MAX_NOTICE_ATTEMPTS, afterFailedNotice } from '../emergency-notice.js';

const NOW = new Date('2026-10-15T16:00:00Z');
const MS_PER_MINUTE = 60_000;

describe('aviso a contactos de emergencia (RF-27)', () => {
  it('el texto no nombra al menor ni el motivo', () => {
    expect(EMERGENCY_NOTICE_TEXT).toBe('No lo logramos contactar por un problema de su estudiante asignado, por favor contáctenos a la brevedad dado que es un tema urgente.');
  });

  it('un aviso nace pendiente y termina enviado, fallido o sin teléfono', () => {
    expect(EMERGENCY_NOTICE_STATUSES).toEqual(['PENDIENTE', 'ENVIADO', 'FALLIDO', 'SIN_TELEFONO']);
  });

  it('un fallo reintenta con espera creciente: 5 y 10 minutos', () => {
    expect(afterFailedNotice(1, NOW)).toEqual({ status: 'PENDIENTE', retryAt: new Date(NOW.getTime() + 5 * MS_PER_MINUTE) });
    expect(afterFailedNotice(2, NOW)).toEqual({ status: 'PENDIENTE', retryAt: new Date(NOW.getTime() + 10 * MS_PER_MINUTE) });
  });

  it('al agotar los intentos queda fallido y ya no se reintenta', () => {
    expect(MAX_NOTICE_ATTEMPTS).toBe(3);
    expect(afterFailedNotice(MAX_NOTICE_ATTEMPTS, NOW)).toEqual({ status: 'FALLIDO', retryAt: null });
  });
});
