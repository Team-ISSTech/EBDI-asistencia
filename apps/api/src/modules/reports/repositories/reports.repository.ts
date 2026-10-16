import type { EstanciaFacts, ReportScope } from '../reports.types.js';

export interface ReportsRepository {
  /** Hechos de asistencia de cada estancia del alcance en la fecha dada; incluye estancias sin jornada. */
  dashboardFacts(date: string, scope: ReportScope): Promise<EstanciaFacts[]>;
}

export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');
