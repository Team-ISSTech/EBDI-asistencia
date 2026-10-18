import { describe, expect, it } from 'vitest';
import {
  createSystemRequestSchema,
  createdSystemResponseSchema,
  integrationTokenRequestSchema,
  integrationTokenResponseSchema,
  systemListResponseSchema,
  systemSchema,
} from '../integration/system.js';

describe('createSystemRequestSchema (RF-37)', () => {
  it('pide nombre y al menos un alcance conocido', () => {
    expect(createSystemRequestSchema.safeParse({ name: 'Tablero institucional', scopes: ['REPORTE_AGREGADO_LEER'] }).success).toBe(true);
    expect(createSystemRequestSchema.safeParse({ name: 'X', scopes: [] }).success).toBe(false);
    expect(createSystemRequestSchema.safeParse({ name: '  ', scopes: ['REPORTE_AGREGADO_LEER'] }).success).toBe(false);
  });

  it('rechaza alcances inventados, un permiso de persona como alcance y repetidos', () => {
    expect(createSystemRequestSchema.safeParse({ name: 'X', scopes: ['TODO'] }).success).toBe(false);
    expect(createSystemRequestSchema.safeParse({ name: 'X', scopes: ['REPORTE_AGREGADO_CONSULTAR'] }).success).toBe(false);
    expect(createSystemRequestSchema.safeParse({ name: 'X', scopes: ['REPORTE_AGREGADO_LEER', 'REPORTE_AGREGADO_LEER'] }).success).toBe(false);
  });

  it('el nombre no pasa de 100 caracteres', () => {
    expect(createSystemRequestSchema.safeParse({ name: 'x'.repeat(101), scopes: ['REPORTE_AGREGADO_LEER'] }).success).toBe(false);
  });
});

describe('respuestas de sistemas', () => {
  const system = {
    id: 1,
    name: 'Tablero institucional',
    clientId: 'a'.repeat(32),
    scopes: ['REPORTE_AGREGADO_LEER'],
    status: 'ACTIVO',
    lastUsedAt: null,
    createdAt: '2026-10-18T12:00:00.000Z',
    revokedAt: null,
  };

  it('describe un sistema sin su secreto: la lista nunca lo lleva', () => {
    expect(systemSchema.safeParse(system).success).toBe(true);
    expect(Object.keys(systemSchema.shape)).not.toEqual(expect.arrayContaining(['clientSecret', 'secretHash']));
    expect(systemListResponseSchema.safeParse({ systems: [system] }).success).toBe(true);
  });

  it('el secreto solo viaja en la respuesta de la creación', () => {
    expect(createdSystemResponseSchema.safeParse({ system, clientSecret: 'secreto' }).success).toBe(true);
    expect(createdSystemResponseSchema.safeParse({ system }).success).toBe(false);
  });
});

describe('token de un sistema', () => {
  it('pide clientId de 32 caracteres hexadecimales y el secreto', () => {
    expect(integrationTokenRequestSchema.safeParse({ clientId: 'a1'.repeat(16), clientSecret: 's' }).success).toBe(true);
    expect(integrationTokenRequestSchema.safeParse({ clientId: 'corto', clientSecret: 's' }).success).toBe(false);
    expect(integrationTokenRequestSchema.safeParse({ clientId: 'a1'.repeat(16), clientSecret: '' }).success).toBe(false);
  });

  it('responde con el token, su tipo, cuánto dura y los alcances', () => {
    expect(integrationTokenResponseSchema.safeParse({ accessToken: 'a.b.c', tokenType: 'Bearer', expiresIn: 900, scope: 'REPORTE_AGREGADO_LEER' }).success).toBe(true);
    expect(integrationTokenResponseSchema.safeParse({ accessToken: 'a.b.c', tokenType: 'Basic', expiresIn: 900, scope: '' }).success).toBe(false);
  });
});
