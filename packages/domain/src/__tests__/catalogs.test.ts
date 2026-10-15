import { describe, expect, it } from 'vitest';
import {
  CHILD_STATUSES,
  ENROLLMENT_MOVEMENTS,
  ENROLLMENT_STATUSES,
  ESTANCIA_STATUSES,
  ROOM_STATUSES,
} from '../catalogs.js';
import { SHIFTS, isShift } from '../attendance.js';

describe('catálogos de valores válidos', () => {
  it('define los turnos de la estancia', () => {
    expect(SHIFTS).toEqual(['MATUTINO', 'VESPERTINO']);
    expect(isShift('MATUTINO')).toBe(true);
    expect(isShift('NOCTURNO')).toBe(false);
  });

  it('coincide con los valores por omisión del esquema SQL', () => {
    expect(ESTANCIA_STATUSES[0]).toBe('ACTIVA');
    expect(ROOM_STATUSES[0]).toBe('ACTIVO');
    expect(CHILD_STATUSES[0]).toBe('ACTIVO');
    expect(ENROLLMENT_STATUSES[0]).toBe('ACTIVA');
  });

  it('cada movimiento tiene un nombre único', () => {
    expect(new Set(ENROLLMENT_MOVEMENTS).size).toBe(ENROLLMENT_MOVEMENTS.length);
  });
});
