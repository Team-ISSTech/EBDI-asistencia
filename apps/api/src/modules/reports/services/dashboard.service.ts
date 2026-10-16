import { Inject, Injectable } from '@nestjs/common';
import { type Principal, ROLE_PERMISSIONS } from '@sirai/auth';
import type { DashboardQuery, DashboardResponse, DashboardRow, DashboardTotals } from '@sirai/contracts';
import { attendanceRate, trafficLight, type TrafficLight } from '@sirai/domain';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { REPORTS_REPOSITORY, type ReportsRepository } from '../repositories/reports.repository.js';
import type { EstanciaFacts, ReportScope } from '../reports.types.js';

/** Orden de atención: lo que está peor, primero; lo que no se capturó antes que lo que va bien. */
const LIGHT_PRIORITY: Readonly<Record<TrafficLight, number>> = { ROJO: 0, AMARILLO: 1, SIN_CAPTURA: 2, VERDE: 3 };

/**
 * Alcance de un reporte según los roles que dan `REPORTE_AGREGADO_CONSULTAR`:
 * el administrador y el supervisor sin región ven todo; el supervisor con
 * región, solo sus regiones (P9); la directora, solo su estancia. Un rol
 * global anula cualquier acotamiento.
 */
export function resolveReportScope(principal: Principal): ReportScope {
  const regions = new Set<string>();
  const estanciaIds = new Set<number>();
  for (const assignment of principal.assignments) {
    if (!ROLE_PERMISSIONS[assignment.role].includes('REPORTE_AGREGADO_CONSULTAR')) continue;
    if (assignment.estanciaId !== null) estanciaIds.add(assignment.estanciaId);
    else if (assignment.region) regions.add(assignment.region);
    else return { kind: 'ALL' };
  }
  return { kind: 'LIMITED', regions: [...regions], estanciaIds: [...estanciaIds] };
}

const toRow = (facts: EstanciaFacts): DashboardRow => {
  const rate = facts.hasJourney ? attendanceRate(facts.present, facts.enrolled) : null;
  return {
    estanciaId: facts.estanciaId,
    code: facts.code,
    name: facts.name,
    region: facts.region,
    enrolled: facts.enrolled,
    present: facts.present,
    absent: facts.absent,
    other: facts.other,
    pending: Math.max(0, facts.enrolled - facts.present - facts.absent - facts.other),
    rate,
    light: trafficLight(rate),
  };
};

const sum = (rows: readonly DashboardRow[], pick: (row: DashboardRow) => number): number => rows.reduce((total, row) => total + pick(row), 0);

const toTotals = (rows: readonly DashboardRow[]): DashboardTotals => {
  const captured = rows.filter((row) => row.rate !== null);
  return {
    estancias: rows.length,
    enrolled: sum(rows, (row) => row.enrolled),
    present: sum(rows, (row) => row.present),
    absent: sum(rows, (row) => row.absent),
    other: sum(rows, (row) => row.other),
    pending: sum(rows, (row) => row.pending),
    rate: attendanceRate(sum(captured, (row) => row.present), sum(captured, (row) => row.enrolled)),
    lights: {
      VERDE: rows.filter((row) => row.light === 'VERDE').length,
      AMARILLO: rows.filter((row) => row.light === 'AMARILLO').length,
      ROJO: rows.filter((row) => row.light === 'ROJO').length,
      SIN_CAPTURA: rows.filter((row) => row.light === 'SIN_CAPTURA').length,
    },
  };
};

/**
 * Tablero semaforizado de asistencia (RF-16). Solo devuelve conteos y
 * porcentajes por estancia: nada identificable de infantes ni tutores (RF-18).
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(REPORTS_REPOSITORY) private readonly reports: ReportsRepository) {}

  async dashboard(auth: AuthContext, query: DashboardQuery): Promise<DashboardResponse> {
    const facts = await this.reports.dashboardFacts(query.date, resolveReportScope(auth.principal));
    const estancias = facts.map(toRow).sort((a, b) => LIGHT_PRIORITY[a.light] - LIGHT_PRIORITY[b.light] || (a.rate ?? 1) - (b.rate ?? 1) || a.name.localeCompare(b.name, 'es'));
    return { date: query.date, totals: toTotals(estancias), estancias };
  }
}
