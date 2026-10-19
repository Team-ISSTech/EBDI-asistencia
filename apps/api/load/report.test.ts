import { describe, expect, it } from 'vitest';
import { evaluate, formatReport } from './report';
import type { Summary } from './stats';

const summary = (p95: number, errors = 0): Summary => ({ requests: 212 + errors, ok: 212, errors, p50: 100, p95, p99: p95 + 10, max: p95 + 20, mean: 120 });
const rows = [
  { operation: 'lista', summary: summary(400), firstError: null },
  { operation: 'guardar', summary: summary(1400), firstError: null },
  { operation: 'login', summary: summary(5000), firstError: null },
];

describe('evaluate (RNF-08: p95 < 1.5 s)', () => {
  it('cumple cuando las operaciones medidas están por debajo del límite y sin errores', () => {
    expect(evaluate(rows, ['lista', 'guardar'], 1500)).toEqual({ pass: true, failures: [] });
  });

  it('las operaciones que no se miden contra el límite (el login) no lo rompen', () => {
    expect(evaluate(rows, ['lista'], 1500).pass).toBe(true);
  });

  it('falla si una operación pasa el límite y dice cuál', () => {
    expect(evaluate(rows, ['lista', 'guardar'], 1000)).toEqual({ pass: false, failures: ['guardar: p95 1400 ms supera 1000 ms'] });
  });

  it('falla ante cualquier error, aunque la latencia sea buena', () => {
    const withError = [{ operation: 'lista', summary: summary(100, 3), firstError: '500 {"error":"x"}' }];
    expect(evaluate(withError, ['lista'], 1500)).toEqual({ pass: false, failures: ['lista: 3 peticiones fallidas (500 {"error":"x"})'] });
  });

  it('falla si una operación exigida no se midió: una prueba que no mide no prueba nada', () => {
    expect(evaluate(rows, ['lista', 'tablero'], 1500).failures).toEqual(['tablero: no se midió']);
  });
});

describe('formatReport', () => {
  it('arma una tabla en Markdown con una fila por operación', () => {
    const text = formatReport(rows, ['lista', 'guardar'], 1500);
    expect(text).toContain('| Operación | Peticiones | Errores | p50 | p95 | p99 | Máx |');
    expect(text).toContain('| lista | 212 | 0 | 100 | 400 | 410 | 420 |');
    expect(text).toContain('| login | 212 | 0 | 100 | 5000 | 5010 | 5020 |');
  });

  it('marca cuáles se miden contra el límite', () => {
    expect(formatReport(rows, ['lista'], 1500)).toMatch(/Se miden contra el límite de 1500 ms: lista/);
  });
});
