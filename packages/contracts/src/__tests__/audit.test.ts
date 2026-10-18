import { describe, expect, it } from 'vitest';
import { auditEntrySchema, auditFiltersResponseSchema, auditListResponseSchema, auditQuerySchema } from '../audit/audit.js';

describe('auditQuerySchema (RF-11)', () => {
  it('sin filtros pide 50 por página', () => {
    expect(auditQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it('convierte los números que llegan como texto en la URL', () => {
    expect(auditQuerySchema.parse({ userId: '7', beforeId: '120', limit: '20' })).toEqual({ userId: 7, beforeId: 120, limit: 20 });
  });

  it('acepta rango de fechas, acción, tabla y registro', () => {
    const query = { from: '2026-10-01T06:00:00.000Z', to: '2026-10-02T05:59:59.999Z', action: 'LOGIN', table: 'usuarios', recordId: '5' };
    expect(auditQuerySchema.parse(query)).toMatchObject(query);
  });

  it('rechaza un rango invertido, un límite fuera de rango y fechas que no son fecha', () => {
    expect(auditQuerySchema.safeParse({ from: '2026-10-02T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ from: 'ayer' }).success).toBe(false);
  });
});

describe('respuestas de auditoría', () => {
  const entry = {
    id: 9,
    occurredAt: '2026-10-18T12:00:00.000Z',
    userId: 3,
    userName: 'Directora Prueba',
    roleCode: 'DIRECTORA',
    action: 'INFANTE_ACTUALIZADO',
    tableName: 'infantes',
    recordId: '12',
    ipAddress: '10.0.0.5',
    userAgent: 'Mozilla/5.0',
    changedFields: ['name'],
  };

  it('describe cada registro sin ningún valor del cambio', () => {
    expect(auditEntrySchema.safeParse(entry).success).toBe(true);
    expect(Object.keys(auditEntrySchema.shape)).not.toEqual(expect.arrayContaining(['before', 'after', 'previousData', 'newData']));
  });

  it('acepta registros sin persona (login fallido de un correo inexistente) y sin IP', () => {
    expect(auditEntrySchema.safeParse({ ...entry, userId: null, userName: null, roleCode: null, recordId: null, ipAddress: null, userAgent: null, changedFields: [] }).success).toBe(true);
  });

  it('la lista lleva el cursor de la página siguiente, o nulo al terminar', () => {
    expect(auditListResponseSchema.safeParse({ entries: [entry], nextBeforeId: 9 }).success).toBe(true);
    expect(auditListResponseSchema.safeParse({ entries: [], nextBeforeId: null }).success).toBe(true);
  });

  it('los filtros disponibles son acciones y tablas', () => {
    expect(auditFiltersResponseSchema.safeParse({ actions: ['LOGIN'], tables: ['usuarios'] }).success).toBe(true);
  });
});
