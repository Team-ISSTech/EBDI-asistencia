import { describe, expect, it } from 'vitest';
import { buildPeriodReport } from '../services/period-report.js';
import type { DayFact, EstanciaInfo } from '../reports.types.js';

const estancia = (id: number, region: string | null = 'Norte'): EstanciaInfo => ({ estanciaId: id, code: `EBDI-${id}`, name: `Estancia ${id}`, region });
const day = (id: number, date: string, present: number, absent: number, other = 0): DayFact => ({ estanciaId: id, date, present, absent, other });
const range = { from: '2026-10-01', to: '2026-10-31' };
const NOW = new Date('2026-11-01T12:00:00Z');

describe('buildPeriodReport', () => {
  it('suma los días de cada estancia y calcula tasa y color', () => {
    const report = buildPeriodReport('MONTH', range, [estancia(1)], [day(1, '2026-10-01', 18, 2), day(1, '2026-10-02', 19, 1)], NOW);
    expect(report.summary[0]).toMatchObject({ days: 2, marks: 40, present: 37, absent: 3, other: 0, rate: 0.925, light: 'VERDE' });
  });

  it('una estancia sin jornadas aparece en el reporte, sin tasa y SIN_CAPTURA', () => {
    const report = buildPeriodReport('MONTH', range, [estancia(1), estancia(2)], [day(1, '2026-10-01', 10, 0)], NOW);
    expect(report.summary.find((row) => row.estanciaId === 2)).toMatchObject({ days: 0, marks: 0, rate: null, light: 'SIN_CAPTURA' });
  });

  it('los totales suman todas las estancias y la tasa global ignora las que no capturaron', () => {
    const report = buildPeriodReport('MONTH', range, [estancia(1), estancia(2), estancia(3)], [day(1, '2026-10-01', 9, 1), day(2, '2026-10-01', 5, 5)], NOW);
    expect(report.totals).toMatchObject({ estancias: 3, days: 2, marks: 20, present: 14, absent: 6, rate: 0.7 });
  });

  it('el detalle trae una fila por estancia y día, ordenada por fecha y nombre', () => {
    const report = buildPeriodReport('MONTH', range, [estancia(2), estancia(1)], [day(2, '2026-10-02', 1, 0), day(1, '2026-10-02', 2, 0), day(1, '2026-10-01', 3, 1)], NOW);
    expect(report.details.map((row) => [row.date, row.estanciaId, row.rate])).toEqual([['2026-10-01', 1, 0.75], ['2026-10-02', 1, 1], ['2026-10-02', 2, 1]]);
  });

  it('ignora días de estancias que no están en el alcance', () => {
    const report = buildPeriodReport('DAY', range, [estancia(1)], [day(1, '2026-10-01', 4, 0), day(99, '2026-10-01', 100, 0)], NOW);
    expect(report.totals.present).toBe(4);
    expect(report.details).toHaveLength(1);
  });

  it('ordena el resumen de peor a mejor asistencia, y sin captura al final de los problemas', () => {
    const report = buildPeriodReport('MONTH', range, [estancia(1), estancia(2), estancia(3)], [day(1, '2026-10-01', 20, 0), day(2, '2026-10-01', 10, 10)], NOW);
    expect(report.summary.map((row) => row.estanciaId)).toEqual([2, 3, 1]);
  });

  it('no contiene nada identificable de infantes', () => {
    const report = buildPeriodReport('DAY', range, [estancia(1)], [day(1, '2026-10-01', 4, 0)], NOW);
    expect(JSON.stringify(report)).not.toMatch(/childName|matricula|curp|telefono/i);
  });
});
