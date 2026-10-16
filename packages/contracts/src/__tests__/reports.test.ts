import { describe, expect, it } from 'vitest';
import { dashboardQuerySchema, dashboardResponseSchema } from '../reports/dashboard.js';

const row = { estanciaId: 1, code: 'EBDI-01', name: 'Estancia 01', region: 'Norte', enrolled: 20, present: 19, absent: 1, other: 0, pending: 0, rate: 0.95, light: 'VERDE' };
const totals = { estancias: 1, enrolled: 20, present: 19, absent: 1, other: 0, pending: 0, rate: 0.95, lights: { VERDE: 1, AMARILLO: 0, ROJO: 0, SIN_CAPTURA: 0 } };

describe('dashboardQuerySchema', () => {
  it('exige una fecha válida', () => {
    expect(dashboardQuerySchema.safeParse({ date: '2026-10-15' }).success).toBe(true);
    expect(dashboardQuerySchema.safeParse({ date: '15/10/2026' }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('dashboardResponseSchema (RF-16 y RF-18)', () => {
  it('acepta el tablero con totales y una fila por estancia', () => {
    expect(dashboardResponseSchema.safeParse({ date: '2026-10-15', totals, estancias: [row, { ...row, estanciaId: 2, rate: null, light: 'SIN_CAPTURA', enrolled: 0, present: 0, absent: 0 }] }).success).toBe(true);
  });

  it('rechaza colores fuera del semáforo y tasas fuera de rango', () => {
    expect(dashboardResponseSchema.safeParse({ date: '2026-10-15', totals, estancias: [{ ...row, light: 'AZUL' }] }).success).toBe(false);
    expect(dashboardResponseSchema.safeParse({ date: '2026-10-15', totals, estancias: [{ ...row, rate: 1.5 }] }).success).toBe(false);
  });

  it('solo trae conteos y porcentajes: nada identificable de infantes ni tutores (S-10)', () => {
    const keys = [...Object.keys(dashboardResponseSchema.shape.estancias.element.shape), ...Object.keys(dashboardResponseSchema.shape.totals.shape)];
    expect(keys.some((key) => /child|infante|nombre|matricula|curp|tutor|guardian|phone|telefono/i.test(key))).toBe(false);
  });
});
