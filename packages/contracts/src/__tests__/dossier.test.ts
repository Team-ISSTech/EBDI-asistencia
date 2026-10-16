import { describe, expect, it } from 'vitest';
import { verifyDossierRequestSchema, verifyDossierResponseSchema } from '../dossier/dossier.js';

const seal = 'a'.repeat(64);

describe('verifyDossierRequestSchema', () => {
  it('acepta el folio y el sello de 64 hexadecimales', () => {
    expect(verifyDossierRequestSchema.safeParse({ folio: 'EXP-2026-000042', seal }).success).toBe(true);
  });

  it('rechaza folios mal formados y sellos que no son SHA-256 en hexadecimal', () => {
    expect(verifyDossierRequestSchema.safeParse({ folio: 'EXP-26-42', seal }).success).toBe(false);
    expect(verifyDossierRequestSchema.safeParse({ folio: 'EXP-2026-000042', seal: 'zz' }).success).toBe(false);
    expect(verifyDossierRequestSchema.safeParse({ folio: 'EXP-2026-000042', seal: 'a'.repeat(63) }).success).toBe(false);
  });

  it('normaliza el sello a minúsculas', () => {
    const parsed = verifyDossierRequestSchema.safeParse({ folio: 'EXP-2026-000042', seal: 'A'.repeat(64) });
    expect(parsed.success && parsed.data.seal).toBe(seal);
  });
});

describe('verifyDossierResponseSchema', () => {
  it('un expediente válido indica cuándo y en qué estancia se emitió, sin datos del infante', () => {
    const valid = { valid: true, issuedAt: '2026-10-15T12:00:00.000Z', originEstancia: 'Estancia de prueba 01' };
    expect(verifyDossierResponseSchema.safeParse(valid).success).toBe(true);
    expect(Object.keys(verifyDossierResponseSchema.options[0].shape).sort()).toEqual(['issuedAt', 'originEstancia', 'valid']);
  });

  it('uno inválido solo dice que no coincide', () => {
    expect(verifyDossierResponseSchema.safeParse({ valid: false }).success).toBe(true);
  });
});
