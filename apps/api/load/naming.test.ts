import { describe, expect, it } from 'vitest';
import { loadEmail, loadEnrollmentNumber, pad } from './naming';

describe('nombres sintéticos de la prueba de carga', () => {
  it('son estables y distintos para cada estancia, rol e infante', () => {
    expect(loadEmail('DIRECTORA', 7)).toBe('directora-007@carga.test');
    expect(loadEmail('TRABAJO_SOCIAL', 212)).toBe('trabajo_social-212@carga.test');
    expect(loadEnrollmentNumber(3, 9)).toBe('CARGA-003-09');
    expect(pad(5, 2)).toBe('05');
  });

  it('las matrículas caben en la columna (20 caracteres) y los correos usan un dominio de prueba', () => {
    expect(loadEnrollmentNumber(212, 40).length).toBeLessThanOrEqual(20);
    expect(loadEmail('DOCENTE', 1)).toMatch(/@carga\.test$/);
  });
});
