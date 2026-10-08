import { describe, expect, it } from 'vitest';
import { createUserRequestSchema, replaceRolesRequestSchema, userSchema } from '../users/user.js';

describe('createUserRequestSchema', () => {
  it('acepta nombre, correo, contraseña temporal y asignaciones', () => {
    const result = createUserRequestSchema.safeParse({
      name: 'Nueva Docente',
      email: 'nueva@sirai.test',
      temporaryPassword: 'Temporal-2026',
      assignments: [{ role: 'DOCENTE', estanciaId: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza contraseñas cortas', () => {
    const result = createUserRequestSchema.safeParse({
      name: 'X',
      email: 'x@sirai.test',
      temporaryPassword: 'corta',
      assignments: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('replaceRolesRequestSchema', () => {
  it('rechaza un rol central con estancia y un rol de estancia sin estancia', () => {
    expect(
      replaceRolesRequestSchema.safeParse({ assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: 1 }] })
        .success,
    ).toBe(false);
    expect(
      replaceRolesRequestSchema.safeParse({ assignments: [{ role: 'DOCENTE', estanciaId: null }] })
        .success,
    ).toBe(false);
  });

  it('rechaza asignaciones repetidas', () => {
    const duplicated = { assignments: [{ role: 'DOCENTE', estanciaId: 1 }, { role: 'DOCENTE', estanciaId: 1 }] };
    expect(replaceRolesRequestSchema.safeParse(duplicated).success).toBe(false);
  });

  it('acepta combinaciones coherentes', () => {
    expect(
      replaceRolesRequestSchema.safeParse({
        assignments: [
          { role: 'DOCENTE', estanciaId: 1 },
          { role: 'SUPERVISOR_CENTRAL', estanciaId: null },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('userSchema', () => {
  it('rechaza un estatus desconocido', () => {
    const result = userSchema.safeParse({
      id: 1,
      name: 'U',
      email: 'u@sirai.test',
      status: 'RARO',
      assignments: [],
      lastAccessAt: null,
    });
    expect(result.success).toBe(false);
  });
});
