import { describe, expect, it } from 'vitest';
import { createEstanciaRequestSchema, estanciaAdminListResponseSchema, updateEstanciaRequestSchema } from '../administration/estancia.js';
import { roomAdminListResponseSchema, updateRoomRequestSchema } from '../catalogs/room.js';

const create = { code: 'EBDI-001', name: 'Estancia Uno', timeZone: 'America/Mexico_City' };

describe('createEstanciaRequestSchema (RF-31)', () => {
  it('acepta clave, nombre y zona horaria, con región, UR y dirección opcionales', () => {
    expect(createEstanciaRequestSchema.safeParse(create).success).toBe(true);
    expect(createEstanciaRequestSchema.safeParse({ ...create, ur: '5G', region: 'Norte', address: 'Calle 1' }).success).toBe(true);
  });

  it('la clave se normaliza a mayúsculas y solo admite letras, números y guiones', () => {
    const parsed = createEstanciaRequestSchema.safeParse({ ...create, code: 'ebdi-001' });
    expect(parsed.success && parsed.data.code).toBe('EBDI-001');
    expect(createEstanciaRequestSchema.safeParse({ ...create, code: 'EBDI 001' }).success).toBe(false);
    expect(createEstanciaRequestSchema.safeParse({ ...create, code: '' }).success).toBe(false);
    expect(createEstanciaRequestSchema.safeParse({ ...create, code: 'X'.repeat(21) }).success).toBe(false);
  });

  it('rechaza zonas horarias que no existen y nombres vacíos', () => {
    expect(createEstanciaRequestSchema.safeParse({ ...create, timeZone: 'Marte/Olimpo' }).success).toBe(false);
    expect(createEstanciaRequestSchema.safeParse({ ...create, name: '  ' }).success).toBe(false);
  });
});

describe('updateEstanciaRequestSchema', () => {
  it('permite cambiar cualquier dato menos la clave, y el estatus', () => {
    expect(updateEstanciaRequestSchema.safeParse({ name: 'Nuevo nombre' }).success).toBe(true);
    expect(updateEstanciaRequestSchema.safeParse({ status: 'INACTIVA' }).success).toBe(true);
    const parsed = updateEstanciaRequestSchema.safeParse({ name: 'X', code: 'OTRA-CLAVE' });
    expect(parsed.success && Object.keys(parsed.data)).not.toContain('code');
  });

  it('rechaza una actualización vacía y estatus fuera del catálogo', () => {
    expect(updateEstanciaRequestSchema.safeParse({}).success).toBe(false);
    expect(updateEstanciaRequestSchema.safeParse({ status: 'CERRADA' }).success).toBe(false);
    expect(updateEstanciaRequestSchema.safeParse({ timeZone: 'Marte/Olimpo' }).success).toBe(false);
  });
});

describe('estanciaAdminListResponseSchema', () => {
  it('acepta la lista de estancias con su estatus', () => {
    const row = { id: 1, code: 'EBDI-001', name: 'Estancia Uno', ur: null, region: 'Norte', address: null, timeZone: 'America/Mexico_City', status: 'ACTIVA' };
    expect(estanciaAdminListResponseSchema.safeParse({ estancias: [row] }).success).toBe(true);
  });
});

describe('updateRoomRequestSchema (RF-32)', () => {
  it('permite cambiar parte de la sala y su estatus', () => {
    expect(updateRoomRequestSchema.safeParse({ name: 'Maternal B' }).success).toBe(true);
    expect(updateRoomRequestSchema.safeParse({ capacity: 20, status: 'INACTIVO' }).success).toBe(true);
    expect(updateRoomRequestSchema.safeParse({ capacity: null }).success).toBe(true);
  });

  it('rechaza una actualización vacía, turnos inventados y rangos de edad invertidos', () => {
    expect(updateRoomRequestSchema.safeParse({}).success).toBe(false);
    expect(updateRoomRequestSchema.safeParse({ shift: 'NOCTURNO' }).success).toBe(false);
    expect(updateRoomRequestSchema.safeParse({ minAgeMonths: 24, maxAgeMonths: 12 }).success).toBe(false);
  });
});

describe('roomAdminListResponseSchema', () => {
  it('trae, además de la sala, cuántos infantes tiene inscritos', () => {
    const room = { id: 1, estanciaId: 1, name: 'Lactantes', shift: 'MATUTINO', minAgeMonths: 0, maxAgeMonths: 18, capacity: 12, status: 'INACTIVO', enrolled: 3 };
    expect(roomAdminListResponseSchema.safeParse({ rooms: [room] }).success).toBe(true);
    expect(roomAdminListResponseSchema.safeParse({ rooms: [{ ...room, enrolled: -1 }] }).success).toBe(false);
  });
});
