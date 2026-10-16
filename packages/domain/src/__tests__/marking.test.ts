import { describe, expect, it } from 'vitest';
import { ATTENDANCE_METHODS, planMark } from '../marking.js';

describe('planMark', () => {
  it('crea el registro cuando el infante aún no tiene uno en la jornada', () => {
    expect(planMark(null, 'PRESENTE')).toBe('CREATE');
  });

  it('cambia el estado cuando es distinto del registrado', () => {
    expect(planMark({ status: 'PRESENTE' }, 'FALTA_INJUSTIFICADA')).toBe('CHANGE');
  });

  it('no hace nada si el estado ya es ese (reintentos y doble toque)', () => {
    expect(planMark({ status: 'PRESENTE' }, 'PRESENTE')).toBe('UNCHANGED');
  });
});

describe('ATTENDANCE_METHODS', () => {
  it('distingue la captura manual de la lectura de código', () => {
    expect(ATTENDANCE_METHODS).toEqual(['MANUAL', 'QR']);
  });
});
