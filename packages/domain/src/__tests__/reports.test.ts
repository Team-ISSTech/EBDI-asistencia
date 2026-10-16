import { describe, expect, it } from 'vitest';
import { GREEN_FROM, REPORT_PERIODS, TRAFFIC_LIGHTS, YELLOW_FROM, attendanceRate, dossierFolio, parseDossierFolio, periodRange, trafficLight } from '../reports.js';

describe('attendanceRate', () => {
  it('es la proporción de presentes sobre los esperados', () => {
    expect(attendanceRate(9, 10)).toBeCloseTo(0.9);
    expect(attendanceRate(0, 10)).toBe(0);
  });

  it('sin esperados no hay tasa', () => {
    expect(attendanceRate(0, 0)).toBeNull();
  });

  it('nunca pasa de 100 %', () => {
    expect(attendanceRate(12, 10)).toBe(1);
  });
});

describe('trafficLight (RF-16)', () => {
  it('los umbrales son 90 % y 75 %', () => {
    expect(GREEN_FROM).toBe(0.9);
    expect(YELLOW_FROM).toBe(0.75);
    expect(TRAFFIC_LIGHTS).toEqual(['VERDE', 'AMARILLO', 'ROJO', 'SIN_CAPTURA']);
  });

  it('verde desde 90 %, amarillo desde 75 % y rojo por debajo', () => {
    expect(trafficLight(0.9)).toBe('VERDE');
    expect(trafficLight(1)).toBe('VERDE');
    expect(trafficLight(0.89)).toBe('AMARILLO');
    expect(trafficLight(0.75)).toBe('AMARILLO');
    expect(trafficLight(0.74)).toBe('ROJO');
    expect(trafficLight(0)).toBe('ROJO');
  });

  it('sin tasa (no se abrió jornada o no hay inscritos) no se pinta de ningún color', () => {
    expect(trafficLight(null)).toBe('SIN_CAPTURA');
  });
});

describe('periodRange (RF-17)', () => {
  it('el corte diario es el propio día', () => {
    expect(periodRange('DAY', '2026-10-15')).toEqual({ from: '2026-10-15', to: '2026-10-15' });
  });

  it('el corte mensual abarca el mes completo, con meses de 28, 30 y 31 días', () => {
    expect(periodRange('MONTH', '2026-10-15')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('MONTH', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('MONTH', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('MONTH', '2026-04-30')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('el corte trimestral es el trimestre calendario', () => {
    expect(periodRange('QUARTER', '2026-01-01')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(periodRange('QUARTER', '2026-05-20')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(periodRange('QUARTER', '2026-09-30')).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(periodRange('QUARTER', '2026-12-31')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });

  it('rechaza fechas mal formadas', () => {
    expect(() => periodRange('DAY', '15/10/2026')).toThrow();
  });

  it('los periodos son los tres que pide el SRS', () => {
    expect(REPORT_PERIODS).toEqual(['DAY', 'MONTH', 'QUARTER']);
  });
});

describe('dossierFolio (RF-19)', () => {
  it('compone el folio con el año y el consecutivo a seis dígitos', () => {
    expect(dossierFolio(42, 2026)).toBe('EXP-2026-000042');
    expect(dossierFolio(1, 2026)).toBe('EXP-2026-000001');
    expect(dossierFolio(1234567, 2027)).toBe('EXP-2027-1234567');
  });

  it('reconoce un folio bien formado y lo descompone', () => {
    expect(parseDossierFolio('EXP-2026-000042')).toEqual({ year: 2026, sequence: 42 });
    expect(parseDossierFolio('EXP-2026-42')).toBeNull();
    expect(parseDossierFolio('OTRO-2026-000042')).toBeNull();
    expect(parseDossierFolio('')).toBeNull();
  });
});
