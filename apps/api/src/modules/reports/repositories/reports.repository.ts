import type { DateRange } from '@sirai/domain';
import type { EstanciaFacts, PeriodFacts, ReportScope } from '../reports.types.js';

export interface ReportsRepository {
  /** Hechos de asistencia de cada estancia del alcance en la fecha dada; incluye estancias sin jornada. */
  dashboardFacts(date: string, scope: ReportScope): Promise<EstanciaFacts[]>;
  /** Estancias del alcance y sus registros agrupados por día en el rango (ambos extremos incluidos). */
  periodFacts(range: DateRange, scope: ReportScope): Promise<PeriodFacts>;
}

export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');
