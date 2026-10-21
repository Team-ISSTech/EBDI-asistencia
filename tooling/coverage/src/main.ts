import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { failingMetrics, parseSummary, renderReport, type Source, sumSummaries } from './consolidate.js';

/** Fuentes de RNF-09 según S-12: lógica de negocio, no componentes visuales. */
const SOURCES = ['packages/domain', 'packages/auth', 'apps/api'] as const;
const ROOT = resolve(import.meta.dirname, '../../..');
const OUTPUT = resolve(ROOT, 'coverage/consolidado.md');

function readSource(name: string): Source {
  const file = resolve(ROOT, name, 'coverage/coverage-summary.json');
  if (!existsSync(file)) throw new Error(`${name}: falta ${file}. Corre \`pnpm test\` antes del reporte.`);
  return { name, summary: parseSummary(JSON.parse(readFileSync(file, 'utf8')) as unknown, name) };
}

function main(): void {
  const sources = SOURCES.map(readSource);
  const report = renderReport(sources);
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, report);
  const stepSummary = process.env['GITHUB_STEP_SUMMARY'];
  if (stepSummary) appendFileSync(stepSummary, report);
  process.stdout.write(report);
  if (failingMetrics(sumSummaries(sources.map((source) => source.summary))).length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
