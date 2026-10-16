export const TRAFFIC_LIGHTS = ['VERDE', 'AMARILLO', 'ROJO', 'SIN_CAPTURA'] as const;
export type TrafficLight = (typeof TRAFFIC_LIGHTS)[number];

/**
 * Umbrales del semáforo (RF-16). El SRS no los define: se asumen 90 % y 75 %
 * y deben confirmarse con el cliente (supuesto S-15).
 */
export const GREEN_FROM = 0.9;
export const YELLOW_FROM = 0.75;

/** Proporción de presentes entre los esperados; nula si no hay esperados. */
export function attendanceRate(present: number, expected: number): number | null {
  if (expected <= 0) return null;
  return Math.min(1, present / expected);
}

/** Color del semáforo; sin tasa (sin jornada o sin inscritos) queda SIN_CAPTURA. */
export function trafficLight(rate: number | null): TrafficLight {
  if (rate === null) return 'SIN_CAPTURA';
  if (rate >= GREEN_FROM) return 'VERDE';
  return rate >= YELLOW_FROM ? 'AMARILLO' : 'ROJO';
}

/** Cortes de las exportaciones (RF-17). El trimestre es el calendario (supuesto S-16). */
export const REPORT_PERIODS = ['DAY', 'MONTH', 'QUARTER'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_PER_QUARTER = 3;

const pad = (value: number): string => String(value).padStart(2, '0');
/** Último día del mes (el día 0 del mes siguiente), sin depender de la zona horaria. */
const lastDayOf = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Rango de fechas (ambos extremos incluidos) del corte que contiene a `anchor` (`YYYY-MM-DD`). */
export function periodRange(period: ReportPeriod, anchor: string): DateRange {
  const match = ISO_DATE.exec(anchor);
  if (!match) throw new Error(`Fecha inválida: ${anchor}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (period === 'DAY') return { from: anchor, to: anchor };
  if (period === 'MONTH') return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDayOf(year, month))}` };
  const firstMonth = Math.floor((month - 1) / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER + 1;
  const lastMonth = firstMonth + MONTHS_PER_QUARTER - 1;
  return { from: `${year}-${pad(firstMonth)}-01`, to: `${year}-${pad(lastMonth)}-${pad(lastDayOf(year, lastMonth))}` };
}

const FOLIO_SEQUENCE_DIGITS = 6;
const FOLIO_PATTERN = /^EXP-(\d{4})-(\d{6,})$/;

/** Folio de un expediente emitido (RF-19): año y consecutivo, que es el id del registro. */
export const dossierFolio = (sequence: number, year: number): string => `EXP-${year}-${String(sequence).padStart(FOLIO_SEQUENCE_DIGITS, '0')}`;

/** Descompone un folio bien formado; `null` si no lo es. */
export function parseDossierFolio(folio: string): { readonly year: number; readonly sequence: number } | null {
  const match = FOLIO_PATTERN.exec(folio);
  return match ? { year: Number(match[1]), sequence: Number(match[2]) } : null;
}
