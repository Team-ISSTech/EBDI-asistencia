/** Percentil por rango más cercano: el menor valor que cubre al menos `p` % de las muestras. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? Number.NaN;
}

export interface Summary {
  readonly requests: number;
  readonly ok: number;
  readonly errors: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

/** Resumen de una operación: `latencies` son las respuestas correctas, en milisegundos; `errors`, las fallidas. */
export function summarize(latencies: readonly number[], errors: number): Summary {
  const total = latencies.reduce((sum, value) => sum + value, 0);
  return {
    requests: latencies.length + errors,
    ok: latencies.length,
    errors,
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: Math.round(Math.max(...latencies, 0)),
    mean: Math.round(latencies.length === 0 ? 0 : total / latencies.length),
  };
}
