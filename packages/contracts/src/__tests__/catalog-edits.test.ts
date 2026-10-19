import { describe, expect, it } from 'vitest';
import { updateChildRequestSchema } from '../catalogs/child.js';
import { unlinkGuardianQuerySchema, unlinkGuardianResponseSchema, updateGuardianLinkRequestSchema, updateGuardianRequestSchema } from '../catalogs/guardian.js';

describe('updateChildRequestSchema (RF-33)', () => {
  it('acepta cambios parciales y no inventa valores para lo que no se manda', () => {
    const parsed = updateChildRequestSchema.safeParse({ name: '  Ana ' });
    expect(parsed.success && parsed.data).toEqual({ name: 'Ana' });
  });

  it('rechaza un cuerpo vacío o que solo trae la matrícula (no se edita) y una fecha futura', () => {
    expect(updateChildRequestSchema.safeParse({}).success).toBe(false);
    expect(updateChildRequestSchema.safeParse({ enrollmentNumber: 'X' }).success).toBe(false);
    expect(updateChildRequestSchema.safeParse({ birthDate: '2999-01-01' }).success).toBe(false);
  });

  it('el grupo de discapacidad no cabe si se declara que no hay discapacidad', () => {
    expect(updateChildRequestSchema.safeParse({ hasDisability: false, disabilityGroup: 'Motriz' }).success).toBe(false);
    expect(updateChildRequestSchema.safeParse({ hasDisability: true, disabilityGroup: 'Motriz' }).success).toBe(true);
  });

  it('normaliza la CURP a mayúsculas y permite quitarla con null', () => {
    const parsed = updateChildRequestSchema.safeParse({ curp: 'abcd010203hdfxyz05' });
    expect(parsed.success && parsed.data.curp).toBe('ABCD010203HDFXYZ05');
    expect(updateChildRequestSchema.safeParse({ curp: null }).success).toBe(true);
  });
});

describe('updateGuardianRequestSchema (RF-34)', () => {
  it('normaliza el teléfono a diez dígitos y exige al menos un cambio', () => {
    const parsed = updateGuardianRequestSchema.safeParse({ phone: '(55) 1234-5678' });
    expect(parsed.success && parsed.data.phone).toBe('5512345678');
    expect(updateGuardianRequestSchema.safeParse({}).success).toBe(false);
    expect(updateGuardianRequestSchema.safeParse({ phone: '123' }).success).toBe(false);
  });
});

describe('updateGuardianLinkRequestSchema (RF-34)', () => {
  it('acepta permisos y cierre de vigencia, y rechaza un cuerpo vacío', () => {
    expect(updateGuardianLinkRequestSchema.safeParse({ canPickUp: false, validUntil: '2026-12-01' }).success).toBe(true);
    expect(updateGuardianLinkRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('desvincular y dar de baja al tutor (RNF-04)', () => {
  it('por defecto solo desvincula; dar de baja al tutor hay que pedirlo', () => {
    expect(unlinkGuardianQuerySchema.parse({})).toEqual({ retireGuardian: false });
    expect(unlinkGuardianQuerySchema.parse({ retireGuardian: 'true' })).toEqual({ retireGuardian: true });
    expect(unlinkGuardianQuerySchema.parse({ retireGuardian: 'false' })).toEqual({ retireGuardian: false });
    expect(unlinkGuardianQuerySchema.safeParse({ retireGuardian: 'quizas' }).success).toBe(false);
  });

  it('la respuesta dice si el tutor se dio de baja', () => {
    expect(unlinkGuardianResponseSchema.safeParse({ guardianRetired: true }).success).toBe(true);
    expect(unlinkGuardianResponseSchema.safeParse({}).success).toBe(false);
  });
});
