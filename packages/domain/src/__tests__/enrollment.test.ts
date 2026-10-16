import { describe, expect, it } from 'vitest';
import { ageInMonths, fitsRoomAge, nextEnrollmentStatus } from '../enrollment.js';

describe('nextEnrollmentStatus', () => {
  it('mantiene activa la inscripción que cambia de sala', () => {
    expect(nextEnrollmentStatus('ACTIVA', 'CAMBIO_SALA')).toEqual({ ok: true, status: 'ACTIVA' });
  });

  it('marca traslado y baja como estados finales', () => {
    expect(nextEnrollmentStatus('ACTIVA', 'TRASLADO')).toEqual({ ok: true, status: 'TRASLADADA' });
    expect(nextEnrollmentStatus('ACTIVA', 'BAJA')).toEqual({ ok: true, status: 'BAJA' });
  });

  it('rechaza movimientos sobre una inscripción que ya no está activa', () => {
    for (const status of ['BAJA', 'TRASLADADA'] as const) {
      expect(nextEnrollmentStatus(status, 'CAMBIO_SALA')).toEqual({ ok: false, reason: 'INSCRIPCION_NO_ACTIVA' });
    }
  });

  it('rechaza el alta sobre una inscripción existente', () => {
    expect(nextEnrollmentStatus('ACTIVA', 'ALTA')).toEqual({ ok: false, reason: 'MOVIMIENTO_INVALIDO' });
  });
});

describe('ageInMonths', () => {
  it('cuenta meses cumplidos', () => {
    expect(ageInMonths('2024-01-15', '2026-01-14')).toBe(23);
    expect(ageInMonths('2024-01-15', '2026-01-15')).toBe(24);
  });

  it('no devuelve edades negativas', () => {
    expect(ageInMonths('2026-05-01', '2026-01-01')).toBe(0);
  });
});

describe('fitsRoomAge', () => {
  it('acepta edades dentro del rango, extremos incluidos', () => {
    expect(fitsRoomAge(12, { minMonths: 12, maxMonths: 24 })).toBe(true);
    expect(fitsRoomAge(24, { minMonths: 12, maxMonths: 24 })).toBe(true);
  });

  it('rechaza edades fuera del rango', () => {
    expect(fitsRoomAge(11, { minMonths: 12, maxMonths: 24 })).toBe(false);
    expect(fitsRoomAge(25, { minMonths: 12, maxMonths: 24 })).toBe(false);
  });

  it('trata un límite nulo como sin restricción', () => {
    expect(fitsRoomAge(100, { minMonths: null, maxMonths: null })).toBe(true);
    expect(fitsRoomAge(5, { minMonths: 6, maxMonths: null })).toBe(false);
  });
});
