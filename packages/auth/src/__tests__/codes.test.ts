import { describe, expect, it } from 'vitest';
import { isPermissionCode } from '../permissions.js';
import { CENTRAL_ROLE_CODES, isRoleCode } from '../roles.js';

describe('isRoleCode', () => {
  it('acepta un código conocido y rechaza desconocidos o no cadenas', () => {
    expect(isRoleCode('DOCENTE')).toBe(true);
    expect(isRoleCode('docente')).toBe(false);
    expect(isRoleCode(42)).toBe(false);
  });

  it('los roles centrales son roles válidos', () => {
    for (const code of CENTRAL_ROLE_CODES) {
      expect(isRoleCode(code)).toBe(true);
    }
  });
});

describe('isPermissionCode', () => {
  it('acepta un código conocido y rechaza desconocidos o no cadenas', () => {
    expect(isPermissionCode('AUDITORIA_CONSULTAR')).toBe(true);
    expect(isPermissionCode('BORRAR_TODO')).toBe(false);
    expect(isPermissionCode(null)).toBe(false);
  });
});
