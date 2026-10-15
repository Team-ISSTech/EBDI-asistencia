import { describe, expect, it } from 'vitest';
import { CONSENT_TYPES, type ConsentFact, canRevoke, currentConsentStatus } from '../consent.js';

const fact = (overrides: Partial<ConsentFact> = {}): ConsentFact => ({
  type: 'CONTACTO_TELEFONICO',
  accepted: true,
  acceptedAt: '2026-10-01T10:00:00.000Z',
  revokedAt: null,
  ...overrides,
});

describe('CONSENT_TYPES', () => {
  it('cubre el tratamiento de datos sensibles y el contacto telefónico del SRS', () => {
    expect(CONSENT_TYPES).toEqual(['TRATAMIENTO_DATOS_SENSIBLES', 'CONTACTO_TELEFONICO']);
  });
});

describe('currentConsentStatus', () => {
  it('es PENDIENTE sin registros del tipo', () => {
    expect(currentConsentStatus([], 'CONTACTO_TELEFONICO')).toBe('PENDIENTE');
    expect(currentConsentStatus([fact({ type: 'TRATAMIENTO_DATOS_SENSIBLES' })], 'CONTACTO_TELEFONICO')).toBe('PENDIENTE');
  });

  it('es ACEPTADO con una aceptación vigente', () => {
    expect(currentConsentStatus([fact()], 'CONTACTO_TELEFONICO')).toBe('ACEPTADO');
  });

  it('es REVOCADO si la última aceptación se revocó', () => {
    expect(currentConsentStatus([fact({ revokedAt: '2026-10-05T10:00:00.000Z' })], 'CONTACTO_TELEFONICO')).toBe('REVOCADO');
  });

  it('es RECHAZADO si el tutor no aceptó', () => {
    expect(currentConsentStatus([fact({ accepted: false })], 'CONTACTO_TELEFONICO')).toBe('RECHAZADO');
  });

  it('decide por el registro más reciente, no por el orden de la lista', () => {
    const revoked = fact({ revokedAt: '2026-10-05T10:00:00.000Z' });
    const renewed = fact({ acceptedAt: '2026-10-10T10:00:00.000Z' });
    expect(currentConsentStatus([renewed, revoked], 'CONTACTO_TELEFONICO')).toBe('ACEPTADO');
    expect(currentConsentStatus([revoked, renewed], 'CONTACTO_TELEFONICO')).toBe('ACEPTADO');
  });
});

describe('canRevoke', () => {
  it('solo una aceptación vigente se puede revocar', () => {
    expect(canRevoke(fact())).toBe(true);
    expect(canRevoke(fact({ revokedAt: '2026-10-05T10:00:00.000Z' }))).toBe(false);
    expect(canRevoke(fact({ accepted: false }))).toBe(false);
  });
});
