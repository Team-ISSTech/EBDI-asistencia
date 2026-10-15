import { describe, expect, it } from 'vitest';
import { childSchema, createChildRequestSchema, enrollChildRequestSchema } from '../catalogs/child.js';
import {
  childGuardianListResponseSchema,
  createGuardianRequestSchema,
  guardianPhoneResponseSchema,
  linkGuardianRequestSchema,
} from '../catalogs/guardian.js';
import { consentListResponseSchema, registerConsentRequestSchema } from '../catalogs/consent.js';
import { createRoomRequestSchema } from '../catalogs/room.js';

describe('createRoomRequestSchema', () => {
  const base = { name: 'Lactantes A', shift: 'MATUTINO', minAgeMonths: 3, maxAgeMonths: 12, capacity: 15 };

  it('acepta una sala válida', () => {
    expect(createRoomRequestSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza turnos que no existen', () => {
    expect(createRoomRequestSchema.safeParse({ ...base, shift: 'NOCTURNO' }).success).toBe(false);
  });

  it('rechaza un rango de edad invertido', () => {
    expect(createRoomRequestSchema.safeParse({ ...base, minAgeMonths: 24, maxAgeMonths: 12 }).success).toBe(false);
  });

  it('permite omitir edades y capacidad', () => {
    const result = createRoomRequestSchema.safeParse({ name: 'Sala única', shift: 'VESPERTINO' });
    expect(result.success && result.data.capacity).toBeNull();
  });
});

describe('createChildRequestSchema', () => {
  const base = { enrollmentNumber: 'M-0001', name: 'Niña', paternalSurname: 'Prueba', birthDate: '2024-03-10' };

  it('acepta los datos mínimos y fija defaults', () => {
    const result = createChildRequestSchema.safeParse(base);
    expect(result.success && result.data.hasDisability).toBe(false);
  });

  it('valida el formato de la CURP', () => {
    expect(createChildRequestSchema.safeParse({ ...base, curp: 'corta' }).success).toBe(false);
    expect(createChildRequestSchema.safeParse({ ...base, curp: 'AAAA240310MDFXXX01' }).success).toBe(true);
  });

  it('rechaza fechas de nacimiento futuras o mal formadas', () => {
    expect(createChildRequestSchema.safeParse({ ...base, birthDate: '10/03/2024' }).success).toBe(false);
    expect(createChildRequestSchema.safeParse({ ...base, birthDate: '2999-01-01' }).success).toBe(false);
  });

  it('exige el grupo de discapacidad solo si hay discapacidad', () => {
    expect(createChildRequestSchema.safeParse({ ...base, disabilityGroup: 'Motriz' }).success).toBe(false);
    expect(createChildRequestSchema.safeParse({ ...base, hasDisability: true, disabilityGroup: 'Motriz' }).success).toBe(true);
  });

  it('la vista del infante no expone el grupo de discapacidad', () => {
    expect(Object.keys(childSchema.shape)).not.toContain('disabilityGroup');
  });
});

describe('createGuardianRequestSchema', () => {
  it('normaliza el teléfono a dígitos y exige 10', () => {
    const ok = createGuardianRequestSchema.safeParse({ name: 'Tutor', paternalSurname: 'Prueba', phone: '55 1234 5678' });
    expect(ok.success && ok.data.phone).toBe('5512345678');
    expect(createGuardianRequestSchema.safeParse({ name: 'Tutor', paternalSurname: 'Prueba', phone: '123' }).success).toBe(false);
  });
});

describe('linkGuardianRequestSchema', () => {
  const base = { guardianId: 1, relationship: 'Madre', validFrom: '2026-08-24' };

  it('acepta el vínculo con sus banderas por omisión', () => {
    const result = linkGuardianRequestSchema.safeParse(base);
    expect(result.success && result.data.isEmergencyContact).toBe(false);
  });

  it('rechaza vigencia que termina antes de empezar', () => {
    expect(linkGuardianRequestSchema.safeParse({ ...base, validUntil: '2026-01-01' }).success).toBe(false);
  });
});

describe('enrollChildRequestSchema', () => {
  const base = { enrollmentNumber: 'M-0001', name: 'Niña', paternalSurname: 'Prueba', birthDate: '2024-03-10' };

  it('exige la sala de la inscripción inicial', () => {
    expect(enrollChildRequestSchema.safeParse(base).success).toBe(false);
    expect(enrollChildRequestSchema.safeParse({ ...base, roomId: 3 }).success).toBe(true);
  });

  it('conserva las reglas del infante', () => {
    expect(enrollChildRequestSchema.safeParse({ ...base, roomId: 3, disabilityGroup: 'Motriz' }).success).toBe(false);
  });

  it('la vista del infante incluye su sala', () => {
    expect(Object.keys(childSchema.shape)).toEqual(expect.arrayContaining(['roomId', 'roomName']));
  });
});

describe('vistas de tutor de un infante', () => {
  const view = {
    id: 1,
    name: 'Tutor',
    paternalSurname: 'Prueba',
    maternalSurname: null,
    hasPhone: true,
    relationship: 'Madre',
    isPrimary: true,
    canPickUp: true,
    isEmergencyContact: false,
    validFrom: '2026-08-24',
    validUntil: null,
  };

  it('acepta la lista de tutores con su vínculo', () => {
    expect(childGuardianListResponseSchema.safeParse({ guardians: [view] }).success).toBe(true);
  });

  it('la vista del vínculo no trae el teléfono', () => {
    expect(Object.keys(childGuardianListResponseSchema.shape.guardians.element.shape)).not.toContain('phone');
  });

  it('el teléfono solo viaja en su propia respuesta', () => {
    expect(guardianPhoneResponseSchema.safeParse({ phone: '5512345678' }).success).toBe(true);
    expect(guardianPhoneResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('contratos de consentimiento', () => {
  const consent = {
    id: 1,
    childId: 5,
    guardianId: 2,
    type: 'CONTACTO_TELEFONICO',
    noticeVersion: 'AP-2026-1',
    accepted: true,
    acceptedAt: '2026-10-14T12:00:00.000Z',
    revokedAt: null,
  };

  it('registra una aceptación con versión del aviso', () => {
    const result = registerConsentRequestSchema.safeParse({ guardianId: 2, type: 'CONTACTO_TELEFONICO', noticeVersion: 'AP-2026-1' });
    expect(result.success && result.data.accepted).toBe(true);
  });

  it('rechaza tipos desconocidos y avisos sin versión', () => {
    expect(registerConsentRequestSchema.safeParse({ guardianId: 2, type: 'OTRO', noticeVersion: 'v1' }).success).toBe(false);
    expect(registerConsentRequestSchema.safeParse({ guardianId: 2, type: 'CONTACTO_TELEFONICO', noticeVersion: ' ' }).success).toBe(false);
  });

  it('acepta el historial de consentimientos del infante', () => {
    expect(consentListResponseSchema.safeParse({ consents: [consent] }).success).toBe(true);
  });
});
