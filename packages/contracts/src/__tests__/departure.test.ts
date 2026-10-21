import { describe, expect, it } from 'vitest';
import {
  authorizedPickupsResponseSchema,
  incidentListResponseSchema,
  registerDepartureRequestSchema,
  registerIncidentRequestSchema,
  rosterEntrySchema,
} from '../index.js';

describe('salida (S-27)', () => {
  it('pide el tutor que recoge', () => {
    expect(registerDepartureRequestSchema.parse({ guardianId: 7 })).toEqual({ guardianId: 7 });
    expect(() => registerDepartureRequestSchema.parse({})).toThrow();
    expect(() => registerDepartureRequestSchema.parse({ guardianId: 0 })).toThrow();
  });

  it('la lista de autorizados lleva solo id, nombre y parentesco', () => {
    const parsed = authorizedPickupsResponseSchema.parse({ guardians: [{ id: 1, name: 'Tutora Uno Prueba', relationship: 'Madre', phone: '5550000000' }] });
    expect(parsed.guardians[0]).toEqual({ id: 1, name: 'Tutora Uno Prueba', relationship: 'Madre' });
  });
});

describe('incidencias (S-27)', () => {
  it('exige un tipo del catálogo y una descripción de 1 a 1000 caracteres, sin espacios sobrantes', () => {
    expect(registerIncidentRequestSchema.parse({ type: 'ACCIDENTE', description: '  Se cayó en el patio.  ' })).toEqual({ type: 'ACCIDENTE', description: 'Se cayó en el patio.' });
    expect(() => registerIncidentRequestSchema.parse({ type: 'PELEA', description: 'x' })).toThrow();
    expect(() => registerIncidentRequestSchema.parse({ type: 'OTRA', description: '   ' })).toThrow();
    expect(() => registerIncidentRequestSchema.parse({ type: 'OTRA', description: 'x'.repeat(1001) })).toThrow();
  });

  it('la descripción viene en null para quien no puede leerla', () => {
    const list = incidentListResponseSchema.parse({ incidents: [{ id: 1, type: 'CONDUCTA', description: null, recordedAt: '2026-10-20T15:00:00.000Z' }] });
    expect(list.incidents[0]?.description).toBeNull();
  });
});

describe('lista del pase de lista', () => {
  it('una lista guardada antes de este cambio (sin salida ni incidencias) se sigue leyendo', () => {
    const entry = rosterEntrySchema.parse({ enrollmentId: 1, childId: 1, childName: 'A', enrollmentNumber: 'M-1', roomId: 1, roomName: 'S', status: 'PRESENTE', medicalLock: false });
    expect(entry).toMatchObject({ leftAt: null, incidentCount: 0 });
  });
});
