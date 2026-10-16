import { describe, expect, it } from 'vitest';
import { followUpListResponseSchema } from '../follow-ups/follow-up.js';

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
