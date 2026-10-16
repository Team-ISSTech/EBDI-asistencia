import { describe, expect, it } from 'vitest';
import { contactListResponseSchema, followUpListResponseSchema, registerContactRequestSchema, registerMedicalReleaseRequestSchema } from '../follow-ups/follow-up.js';

const ticket = {
  id: 1,
  childId: 5,
  childName: 'Infante Prueba',
  enrollmentNumber: 'M-1',
  roomName: 'Lactantes',
  absenceDate: '2026-10-15',
  absenceStatus: 'FALTA_INJUSTIFICADA',
  status: 'ABIERTO',
  cause: null,
  expectedReturnDate: null,
  requiresMedicalRelease: false,
  medicalReleased: false,
  attemptCount: 0,
  nextAttemptAt: null,
  emergencyAlert: false,
  openedAt: '2026-10-15T15:00:00.000Z',
};

describe('followUpListResponseSchema', () => {
  it('acepta un ticket abierto sin causa y uno clasificado', () => {
    const classified = { ...ticket, id: 2, status: 'CLASIFICADO', cause: 'ENF_CASA', expectedReturnDate: '2026-10-20', requiresMedicalRelease: true };
    expect(followUpListResponseSchema.safeParse({ followUps: [ticket, classified] }).success).toBe(true);
  });

  it('rechaza causas y estados que no existen', () => {
    expect(followUpListResponseSchema.safeParse({ followUps: [{ ...ticket, cause: 'OTRA' }] }).success).toBe(false);
    expect(followUpListResponseSchema.safeParse({ followUps: [{ ...ticket, status: 'PERDIDO' }] }).success).toBe(false);
  });

  it('el estado de ausencia solo puede ser una ausencia', () => {
    expect(followUpListResponseSchema.safeParse({ followUps: [{ ...ticket, absenceStatus: 'PRESENTE' }] }).success).toBe(false);
  });

  it('no expone teléfonos, notas ni datos de salud', () => {
    const keys = Object.keys(followUpListResponseSchema.shape.followUps.element.shape);
    expect(keys.some((key) => /phone|note|telefono|diagn/i.test(key))).toBe(false);
  });
});

describe('registerContactRequestSchema', () => {
  const reached = { result: 'CONTACTADO', guardianId: 3, cause: 'ENF_CASA', expectedReturnDate: '2026-10-20', notes: 'Fiebre desde ayer; se le indicó acudir a su clínica.' };

  it('acepta un contacto con causa, fecha de retorno y notas', () => {
    expect(registerContactRequestSchema.safeParse(reached).success).toBe(true);
  });

  it('un contacto exige tutor, causa válida y fecha de retorno', () => {
    expect(registerContactRequestSchema.safeParse({ ...reached, guardianId: undefined }).success).toBe(false);
    expect(registerContactRequestSchema.safeParse({ ...reached, cause: undefined }).success).toBe(false);
    expect(registerContactRequestSchema.safeParse({ ...reached, expectedReturnDate: undefined }).success).toBe(false);
    expect(registerContactRequestSchema.safeParse({ ...reached, cause: 'NO_LOC' }).success).toBe(false);
  });

  it('un intento sin respuesta no lleva causa ni fecha; el tutor y las notas son opcionales', () => {
    expect(registerContactRequestSchema.safeParse({ result: 'SIN_RESPUESTA' }).success).toBe(true);
    expect(registerContactRequestSchema.safeParse({ result: 'SIN_RESPUESTA', guardianId: 3, notes: 'No contestó' }).success).toBe(true);
    const stripped = registerContactRequestSchema.safeParse({ result: 'SIN_RESPUESTA', cause: 'ENF_CASA' });
    expect(stripped.success && Object.keys(stripped.data)).not.toContain('cause');
  });

  it('limita el tamaño de las notas y rechaza notas vacías', () => {
    expect(registerContactRequestSchema.safeParse({ ...reached, notes: 'x'.repeat(2001) }).success).toBe(false);
    expect(registerContactRequestSchema.safeParse({ ...reached, notes: '   ' }).success).toBe(false);
  });
});

describe('contactListResponseSchema', () => {
  it('trae el historial con las notas descifradas, que solo viajan por una ruta con permiso propio', () => {
    const contact = { id: 1, attemptNumber: 1, occurredAt: '2026-10-15T16:00:00.000Z', result: 'SIN_RESPUESTA', guardianId: null, notes: null, nextAttemptAt: '2026-10-15T20:00:00.000Z' };
    expect(contactListResponseSchema.safeParse({ contacts: [contact] }).success).toBe(true);
  });
});

describe('registerMedicalReleaseRequestSchema', () => {
  it('acepta la fecha de alta con folio y observaciones opcionales', () => {
    expect(registerMedicalReleaseRequestSchema.safeParse({ dischargeDate: '2026-10-28' }).success).toBe(true);
    expect(registerMedicalReleaseRequestSchema.safeParse({ dischargeDate: '2026-10-28', folio: 'ALTA-0042', observations: 'Sin fiebre desde hace 48 h.' }).success).toBe(true);
  });

  it('exige una fecha válida y limita folio y observaciones', () => {
    expect(registerMedicalReleaseRequestSchema.safeParse({}).success).toBe(false);
    expect(registerMedicalReleaseRequestSchema.safeParse({ dischargeDate: '28/10/2026' }).success).toBe(false);
    expect(registerMedicalReleaseRequestSchema.safeParse({ dischargeDate: '2026-10-28', folio: 'x'.repeat(101) }).success).toBe(false);
    expect(registerMedicalReleaseRequestSchema.safeParse({ dischargeDate: '2026-10-28', observations: 'x'.repeat(2001) }).success).toBe(false);
    expect(registerMedicalReleaseRequestSchema.safeParse({ dischargeDate: '2026-10-28', observations: '  ' }).success).toBe(false);
  });
});
