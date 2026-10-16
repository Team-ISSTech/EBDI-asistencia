import { describe, expect, it } from 'vitest';
import { RETRY_BASE_MS, RETRY_MAX_MS, SYNC_ENTITIES, SYNC_OPERATION_TYPES, SYNC_RESULT_STATUSES, isTransientFailure, nextRetryDelayMs } from '../sync.js';

describe('catálogos de sincronización', () => {
  it('las operaciones que se pueden capturar sin conexión son el pase de lista y las llamadas de seguimiento', () => {
    expect(SYNC_OPERATION_TYPES).toEqual(['ATTENDANCE_MARKS', 'FOLLOW_UP_CONTACT']);
    expect(SYNC_ENTITIES).toEqual({ ATTENDANCE_MARKS: 'ASISTENCIA', FOLLOW_UP_CONTACT: 'CONTACTO_SEGUIMIENTO' });
  });

  it('el servidor responde aplicada, parcial o rechazada', () => {
    expect(SYNC_RESULT_STATUSES).toEqual(['APLICADA', 'PARCIAL', 'RECHAZADA']);
  });
});

describe('nextRetryDelayMs (RF-21)', () => {
  it('el primer reintento espera 5 segundos y cada uno duplica la espera', () => {
    expect(RETRY_BASE_MS).toBe(5_000);
    expect(nextRetryDelayMs(1)).toBe(5_000);
    expect(nextRetryDelayMs(2)).toBe(10_000);
    expect(nextRetryDelayMs(3)).toBe(20_000);
  });

  it('nunca espera más de 5 minutos', () => {
    expect(RETRY_MAX_MS).toBe(300_000);
    expect(nextRetryDelayMs(7)).toBe(300_000);
    expect(nextRetryDelayMs(50)).toBe(300_000);
  });

  it('un intento inválido se trata como el primero', () => {
    expect(nextRetryDelayMs(0)).toBe(5_000);
    expect(nextRetryDelayMs(-3)).toBe(5_000);
    expect(nextRetryDelayMs(Number.NaN)).toBe(5_000);
  });
});

describe('isTransientFailure (RF-23)', () => {
  it('una falla de red o del servidor se reintenta: no se pierde la operación', () => {
    expect(isTransientFailure(null)).toBe(true);
    for (const status of [408, 429, 500, 502, 503, 504]) expect(isTransientFailure(status)).toBe(true);
  });

  it('un rechazo del servidor no se reintenta igual: pide revisión humana', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) expect(isTransientFailure(status)).toBe(false);
  });

  it('una respuesta correcta no es una falla', () => {
    expect(isTransientFailure(200)).toBe(false);
  });
});
