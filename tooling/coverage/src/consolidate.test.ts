import { describe, expect, it } from 'vitest';
import { failingMetrics, parseSummary, percent, renderReport, sumSummaries, type Summary } from './consolidate.js';

const summary = (lines: [number, number], statements: [number, number], functions: [number, number], branches: [number, number]): Summary => ({
  lines: { total: lines[0], covered: lines[1] },
  statements: { total: statements[0], covered: statements[1] },
  functions: { total: functions[0], covered: functions[1] },
  branches: { total: branches[0], covered: branches[1] },
});

/** Lo que escribe el reporter json-summary de Vitest: un total y una entrada por archivo. */
const vitestSummary = (s: Summary) => ({ total: { ...s, branchesTrue: { total: 0, covered: 0, pct: 'Unknown' } }, '/repo/src/a.ts': s });

describe('parseSummary', () => {
  it('lee el total del json-summary de Vitest', () => {
    const expected = summary([10, 9], [12, 10], [4, 4], [6, 3]);
    expect(parseSummary(vitestSummary(expected), 'packages/auth')).toEqual(expected);
  });

  it('rechaza un archivo sin total o con cuentas que no son números, nombrando la fuente', () => {
    expect(() => parseSummary({}, 'apps/api')).toThrow(/apps\/api/);
    expect(() => parseSummary({ total: { lines: { total: '10', covered: 9 } } }, 'apps/api')).toThrow(/apps\/api.*lines/);
  });
});

describe('sumSummaries', () => {
  it('suma las cuentas en lugar de promediar porcentajes', () => {
    // 1 de 1 (100 %) y 0 de 99 (0 %): el promedio daría 50 %, la suma da 1 %.
    const total = sumSummaries([summary([1, 1], [1, 1], [1, 1], [1, 1]), summary([99, 0], [99, 0], [99, 0], [99, 0])]);
    expect(total.lines).toEqual({ total: 100, covered: 1 });
    expect(percent(total.lines)).toBe(1);
  });
});

describe('percent', () => {
  it('redondea a un decimal y trata "nada que cubrir" como 100 %', () => {
    expect(percent({ total: 3, covered: 2 })).toBe(66.7);
    expect(percent({ total: 0, covered: 0 })).toBe(100);
  });
});

describe('failingMetrics', () => {
  it('exige 80 % en líneas, sentencias y funciones y 75 % en ramas', () => {
    expect(failingMetrics(summary([100, 80], [100, 80], [100, 80], [100, 75]))).toEqual([]);
    expect(failingMetrics(summary([100, 79], [100, 80], [100, 80], [100, 74]))).toEqual(['lines', 'branches']);
  });
});

describe('renderReport', () => {
  it('muestra cada fuente y el total, y dice qué métrica no llega', () => {
    const sources = [
      { name: 'packages/domain', summary: summary([10, 10], [10, 10], [10, 10], [10, 10]) },
      { name: 'apps/api', summary: summary([90, 60], [90, 80], [90, 80], [90, 80]) },
    ];
    const report = renderReport(sources);
    expect(report).toContain('| packages/domain | 100 % | 100 % | 100 % | 100 % |');
    expect(report).toContain('| apps/api | 66.7 % | 88.9 % | 88.9 % | 88.9 % |');
    expect(report).toContain('| **Total** | **70 %** | **90 %** | **90 %** | **90 %** |');
    expect(report).toContain('No llega al umbral: líneas.');
  });
});
