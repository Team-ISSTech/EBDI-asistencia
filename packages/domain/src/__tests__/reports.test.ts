import { describe, expect, it } from 'vitest';
import { GREEN_FROM, TRAFFIC_LIGHTS, YELLOW_FROM, attendanceRate, trafficLight } from '../reports.js';

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
