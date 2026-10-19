import { describe, expect, it } from 'vitest';
import { assertAdminInput, generateTemporaryPassword } from '../seed/bootstrap-admin.js';

describe('generateTemporaryPassword', () => {
  it('genera contraseñas largas, distintas cada vez y sin caracteres que se confundan al teclearlas', () => {
    const first = generateTemporaryPassword();
    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(first).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(generateTemporaryPassword()).not.toBe(first);
  });
});

describe('assertAdminInput', () => {
  it('acepta un correo y un nombre', () => {
    expect(() => assertAdminInput({ email: 'admin@institucion.gob.mx', name: 'Ana Admin' })).not.toThrow();
  });

  it('rechaza un correo inválido o un nombre vacío', () => {
    expect(() => assertAdminInput({ email: 'sin-arroba', name: 'Ana' })).toThrow(/correo/i);
    expect(() => assertAdminInput({ email: 'a@b.mx', name: '  ' })).toThrow(/nombre/i);
  });

  it('rechaza los correos de la semilla de desarrollo: no son cuentas reales', () => {
    expect(() => assertAdminInput({ email: 'admin_central@sirai.test', name: 'Ana' })).toThrow(/sirai\.test/);
  });
});
