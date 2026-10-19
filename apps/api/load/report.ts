import type { Summary } from './stats';

export interface OperationReport {
  readonly operation: string;
  readonly summary: Summary;
  readonly firstError: string | null;
}

export interface Verdict {
  readonly pass: boolean;
  readonly failures: readonly string[];
}

const failuresOf = (row: OperationReport | undefined, operation: string, limitMs: number): string[] => {
  if (!row) return [`${operation}: no se midió`];
  const found: string[] = [];
  if (row.summary.errors > 0) found.push(`${operation}: ${row.summary.errors} peticiones fallidas (${row.firstError ?? 'sin detalle'})`);
  if (row.summary.ok > 0 && row.summary.p95 > limitMs) found.push(`${operation}: p95 ${row.summary.p95} ms supera ${limitMs} ms`);
  return found;
};

/** RNF-08: las operaciones de asistencia y seguimiento (`gated`) deben dar p95 bajo el límite y cero errores. */
export function evaluate(rows: readonly OperationReport[], gated: readonly string[], limitMs: number): Verdict {
  const failures = gated.flatMap((operation) => failuresOf(rows.find((row) => row.operation === operation), operation, limitMs));
  return { pass: failures.length === 0, failures };
}

export function formatReport(rows: readonly OperationReport[], gated: readonly string[], limitMs: number): string {
  const lines = rows.map(({ operation, summary }) => `| ${operation} | ${summary.requests} | ${summary.errors} | ${summary.p50} | ${summary.p95} | ${summary.p99} | ${summary.max} |`);
  return [
    '| Operación | Peticiones | Errores | p50 | p95 | p99 | Máx |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...lines,
    '',
    `Tiempos en milisegundos. Se miden contra el límite de ${limitMs} ms: ${gated.join(', ')}.`,
  ].join('\n');
}
