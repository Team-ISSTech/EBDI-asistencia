import { describe, expect, it } from 'vitest';
import { can, permissionsFor } from '../can.js';
import type { Principal } from '../principal.js';

const principal = (assignments: Principal['assignments']): Principal => ({
  userId: 1,
  assignments,
});

describe('can', () => {
  it('concede dentro de la estancia asignada', () => {
    const docente = principal([{ role: 'DOCENTE', estanciaId: 1 }]);
    expect(can(docente, 'ASISTENCIA_REGISTRAR', { estanciaId: 1 })).toBe(true);
  });

  it('niega fuera de la estancia asignada', () => {
    const docente = principal([{ role: 'DOCENTE', estanciaId: 1 }]);
    expect(can(docente, 'ASISTENCIA_REGISTRAR', { estanciaId: 2 })).toBe(false);
  });

  it('niega un permiso que el rol no tiene aunque la estancia coincida', () => {
    const docente = principal([{ role: 'DOCENTE', estanciaId: 1 }]);
    expect(can(docente, 'USUARIO_ADMINISTRAR', { estanciaId: 1 })).toBe(false);
  });

  it('un rol central (estanciaId null) concede en cualquier estancia', () => {
    const admin = principal([{ role: 'ADMIN_CENTRAL', estanciaId: null }]);
    expect(can(admin, 'USUARIO_ADMINISTRAR', { estanciaId: 7 })).toBe(true);
    expect(can(admin, 'USUARIO_ADMINISTRAR', { estanciaId: null })).toBe(true);
  });

  it('un rol de estancia no concede cuando no hay estancia activa', () => {
    const docente = principal([{ role: 'DOCENTE', estanciaId: 1 }]);
    expect(can(docente, 'ASISTENCIA_CONSULTAR', { estanciaId: null })).toBe(false);
  });

  it('sin asignaciones no concede nada', () => {
    expect(can(principal([]), 'ASISTENCIA_CONSULTAR', { estanciaId: 1 })).toBe(false);
  });

  it('con varias asignaciones basta con que una conceda', () => {
    const mixed = principal([
      { role: 'DOCENTE', estanciaId: 1 },
      { role: 'MEDICO', estanciaId: 2 },
    ]);
    expect(can(mixed, 'ALTA_MEDICA_REGISTRAR', { estanciaId: 2 })).toBe(true);
    expect(can(mixed, 'ALTA_MEDICA_REGISTRAR', { estanciaId: 1 })).toBe(false);
  });
});

describe('permissionsFor', () => {
  it('une los permisos de las asignaciones aplicables sin duplicados', () => {
    const mixed = principal([
      { role: 'DOCENTE', estanciaId: 1 },
      { role: 'TRABAJO_SOCIAL', estanciaId: 1 },
      { role: 'MEDICO', estanciaId: 2 },
    ]);
    const result = permissionsFor(mixed, { estanciaId: 1 });
    expect(new Set(result).size).toBe(result.length);
    expect([...result].sort()).toEqual(
      [
        'ASISTENCIA_CONSULTAR',
        'ASISTENCIA_REGISTRAR',
        'INFANTE_CONSULTAR',
        'SEGUIMIENTO_CONSULTAR',
        'SEGUIMIENTO_REGISTRAR',
        'NOTA_SENSIBLE_CONSULTAR',
      ].sort(),
    );
  });

  it('devuelve lista vacía sin asignaciones aplicables', () => {
    const docente = principal([{ role: 'DOCENTE', estanciaId: 1 }]);
    expect(permissionsFor(docente, { estanciaId: 9 })).toEqual([]);
  });
});
