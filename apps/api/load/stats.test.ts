import { describe, expect, it } from 'vitest';
import { percentile, summarize } from './stats';

describe('percentile (rango más cercano)', () => {
  it('toma el valor del que ya no se supera el porcentaje pedido', () => {
    const samples = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 95)).toBe(95);
    expect(percentile(samples, 99)).toBe(99);
    expect(percentile(samples, 100)).toBe(100);
  });

  it('no depende del orden en que llegaron las muestras', () => {
    expect(percentile([900, 100, 500, 300, 700], 95)).toBe(900);
    expect(percentile([900, 100, 500, 300, 700], 50)).toBe(500);
  });

  it('con una sola muestra, es esa', () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it('sin muestras no inventa un número', () => {
    expect(Number.isNaN(percentile([], 95))).toBe(true);
  });
});

describe('summarize', () => {
  it('resume latencias y errores de una operación', () => {
    const summary = summarize([10, 20, 30, 40, 1000], 2);
    expect(summary).toEqual({ requests: 7, ok: 5, errors: 2, p50: 30, p95: 1000, p99: 1000, max: 1000, mean: 220 });
  });

  it('redondea al milisegundo', () => {
    expect(summarize([1.26, 1.34], 0).mean).toBe(1);
  });
});
