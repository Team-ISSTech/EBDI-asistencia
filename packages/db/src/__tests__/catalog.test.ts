import { PERMISSION_CODES, ROLE_CODES, ROLE_PERMISSIONS } from '@sirai/auth';
import { describe, expect, it } from 'vitest';
import { expectedRolePermissionPairs } from '../seed/catalog.js';
import { assertSeedAllowed } from '../seed/dev.js';
import { databaseNameOf, dropAllObjects } from '../migrate/runner.js';

describe('expectedRolePermissionPairs', () => {
  it('produce un par por cada permiso de cada rol de la matriz', () => {
    const pairs = expectedRolePermissionPairs();
    const total = Object.values(ROLE_PERMISSIONS).reduce((sum, list) => sum + list.length, 0);
    expect(pairs).toHaveLength(total);
    for (const { role, permission } of pairs) {
      expect(ROLE_CODES).toContain(role);
      expect(PERMISSION_CODES).toContain(permission);
      expect(ROLE_PERMISSIONS[role]).toContain(permission);
    }
  });
});

describe('assertSeedAllowed', () => {
  it('se niega en producción y con contraseñas cortas; acepta en desarrollo', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' }, 'contrasena-larga')).toThrow(/NODE_ENV=production/);
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' }, 'corta')).toThrow(/10 caracteres/);
    expect(() => assertSeedAllowed({}, 'contrasena-larga')).not.toThrow();
  });
});

describe('dropAllObjects', () => {
  it('solo acepta bases de prueba (_test) y nunca conecta a otras', async () => {
    expect(databaseNameOf('mysql://u:p@h:3306/sirai_test')).toBe('sirai_test');
    await expect(dropAllObjects('mysql://u:p@h:3306/sirai')).rejects.toThrow(/_test/);
  });
});
