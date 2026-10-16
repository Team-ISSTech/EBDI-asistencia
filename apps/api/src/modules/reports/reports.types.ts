import type { DateRange, ReportPeriod, TrafficLight } from '@sirai/domain';

/** Hechos crudos de una estancia ese día; el servicio deriva pendientes, tasa y color. */
export interface EstanciaFacts {
  readonly estanciaId: number;
  readonly code: string;
  readonly name: string;
  readonly region: string | null;
  /** ¿Se abrió alguna jornada ese día? Sin jornada no hay captura. */
  readonly hasJourney: boolean;
  readonly enrolled: number;
  readonly present: number;
  readonly absent: number;
  readonly other: number;
}

/** A qué estancias puede acceder quien consulta un reporte. */
export type ReportScope =
  | { readonly kind: 'ALL' }
  | { readonly kind: 'LIMITED'; readonly regions: readonly string[]; readonly estanciaIds: readonly number[] };

/** Estancia del alcance, haya tenido jornadas o no en el periodo. */
export interface EstanciaInfo {
  readonly estanciaId: number;
  readonly code: string;
  readonly name: string;
  readonly region: string | null;
}

/** Registros de un día en una estancia (todas sus jornadas del día). */
export interface DayFact {
  readonly estanciaId: number;
  readonly date: string;
  readonly present: number;
  readonly absent: number;
  readonly other: number;
}

export interface PeriodFacts {
  readonly estancias: readonly EstanciaInfo[];
  readonly days: readonly DayFact[];
}

export interface PeriodSummaryRow extends EstanciaInfo {
  /** Días con al menos una jornada en el periodo. */
  readonly days: number;
  /** Registros de asistencia capturados: presentes + ausentes + otros. */
  readonly marks: number;
  readonly present: number;
  readonly absent: number;
  readonly other: number;
  readonly rate: number | null;
  readonly light: TrafficLight;
}

export interface PeriodDetailRow extends EstanciaInfo {
  readonly date: string;
  readonly present: number;
  readonly absent: number;
  readonly other: number;
  readonly rate: number | null;
}

/** Corte listo para exportar: solo conteos y porcentajes (RF-18, S-10). */
export interface PeriodReport {
  readonly period: ReportPeriod;
  readonly range: DateRange;
  readonly generatedAt: Date;
  readonly summary: readonly PeriodSummaryRow[];
  readonly totals: Omit<PeriodSummaryRow, keyof EstanciaInfo | 'light'> & { readonly estancias: number };
  readonly details: readonly PeriodDetailRow[];
}
