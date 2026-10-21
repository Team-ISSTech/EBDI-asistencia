/**
 * Reporte consolidado de cobertura (RNF-09, S-12): suma las cuentas de cada
 * fuente (el `total` del json-summary de Vitest, que ya suma archivo por
 * archivo) en lugar de promediar porcentajes.
 */
export const METRICS = ['lines', 'statements', 'functions', 'branches'] as const;
export type Metric = (typeof METRICS)[number];

export interface Counts {
  readonly total: number;
  readonly covered: number;
}

export type Summary = Readonly<Record<Metric, Counts>>;

export interface Source {
  readonly name: string;
  readonly summary: Summary;
}

/** 80 % en líneas, sentencias y funciones; 75 % en ramas, el mismo umbral que ya exige la API. */
export const THRESHOLDS: Readonly<Record<Metric, number>> = { lines: 80, statements: 80, functions: 80, branches: 75 };

const LABELS: Readonly<Record<Metric, string>> = { lines: 'líneas', statements: 'sentencias', functions: 'funciones', branches: 'ramas' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function parseCounts(raw: unknown, source: string, metric: Metric): Counts {
  const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (!isRecord(raw) || !isCount(raw['total']) || !isCount(raw['covered'])) {
    throw new Error(`${source}: el resumen de cobertura no trae cuentas válidas de ${metric}.`);
  }
  return { total: raw['total'], covered: raw['covered'] };
}

/** Lee la entrada `total` de un `coverage-summary.json`; falla con el nombre de la fuente si no tiene la forma esperada. */
export function parseSummary(raw: unknown, source: string): Summary {
  const total = isRecord(raw) ? raw['total'] : undefined;
  if (!isRecord(total)) throw new Error(`${source}: el resumen de cobertura no tiene la entrada "total".`);
  const entries = METRICS.map((metric) => [metric, parseCounts(total[metric], source, metric)] as const);
  return Object.fromEntries(entries) as Record<Metric, Counts>;
}

export function sumSummaries(summaries: readonly Summary[]): Summary {
  const entries = METRICS.map((metric) => {
    const counts = summaries.reduce((sum, summary) => ({ total: sum.total + summary[metric].total, covered: sum.covered + summary[metric].covered }), { total: 0, covered: 0 });
    return [metric, counts] as const;
  });
  return Object.fromEntries(entries) as Record<Metric, Counts>;
}

/** Porcentaje con un decimal; sin nada que cubrir cuenta como 100 %. */
export const percent = ({ total, covered }: Counts): number => (total === 0 ? 100 : Math.round((covered / total) * 1000) / 10);

export const failingMetrics = (summary: Summary): Metric[] => METRICS.filter((metric) => percent(summary[metric]) < THRESHOLDS[metric]);

const row = (name: string, summary: Summary, bold: boolean): string => {
  const mark = (text: string): string => (bold ? `**${text}**` : text);
  return `| ${mark(name)} | ${METRICS.map((metric) => mark(`${percent(summary[metric])} %`)).join(' | ')} |`;
};

/** Tabla Markdown por fuente y total, más el veredicto contra los umbrales. */
export function renderReport(sources: readonly Source[]): string {
  const total = sumSummaries(sources.map((source) => source.summary));
  const failing = failingMetrics(total);
  const verdict = failing.length === 0 ? 'Cumple los umbrales de RNF-09.' : `No llega al umbral: ${failing.map((metric) => LABELS[metric]).join(', ')}.`;
  return [
    '## Cobertura consolidada (RNF-09)',
    '',
    '| Fuente | Líneas | Sentencias | Funciones | Ramas |',
    '| --- | --- | --- | --- | --- |',
    ...sources.map((source) => row(source.name, source.summary, false)),
    row('Total', total, true),
    '',
    verdict,
    '',
  ].join('\n');
}
