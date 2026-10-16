import type { Principal } from '@sirai/auth';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import type { ReportsRepository } from '../repositories/reports.repository.js';
import type { EstanciaFacts, PeriodFacts, ReportScope } from '../reports.types.js';
import { DashboardService, resolveReportScope } from '../services/dashboard.service.js';

const facts = (id: number, overrides: Partial<EstanciaFacts> = {}): EstanciaFacts => ({
  estanciaId: id, code: `EBDI-${id}`, name: `Estancia ${id}`, region: 'Norte', hasJourney: true, enrolled: 20, present: 19, absent: 1, other: 0, ...overrides,
});

class FakeRepo implements ReportsRepository {
  rows: EstanciaFacts[] = [];
  lastScope: ReportScope | null = null;
  dashboardFacts(_date: string, scope: ReportScope): Promise<EstanciaFacts[]> {
    this.lastScope = scope;
    return Promise.resolve(this.rows);
  }
  periodFacts(): Promise<PeriodFacts> {
    return Promise.resolve({ estancias: [], days: [] });
  }
}

const authOf = (principal: Principal, activeEstanciaId: number | null = null): AuthContext => ({ sessionId: 1, userId: principal.userId, principal, activeEstanciaId });
const admin: Principal = { userId: 1, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] };

describe('resolveReportScope (RF-10 y P9)', () => {
  it('el administrador central ve todas las estancias', () => {
    expect(resolveReportScope(admin)).toEqual({ kind: 'ALL' });
  });

  it('un supervisor sin región ve todas; con región, solo esa región', () => {
    expect(resolveReportScope({ userId: 2, assignments: [{ role: 'SUPERVISOR_CENTRAL', estanciaId: null }] })).toEqual({ kind: 'ALL' });
    expect(resolveReportScope({ userId: 2, assignments: [{ role: 'SUPERVISOR_CENTRAL', estanciaId: null, region: 'Norte' }] })).toEqual({ kind: 'LIMITED', regions: ['Norte'], estanciaIds: [] });
  });

  it('un supervisor con varias regiones las suma sin repetir', () => {
    const principal: Principal = { userId: 2, assignments: [{ role: 'SUPERVISOR_CENTRAL', estanciaId: null, region: 'Norte' }, { role: 'SUPERVISOR_CENTRAL', estanciaId: null, region: 'Sur' }, { role: 'SUPERVISOR_CENTRAL', estanciaId: null, region: 'Norte' }] };
    expect(resolveReportScope(principal)).toEqual({ kind: 'LIMITED', regions: ['Norte', 'Sur'], estanciaIds: [] });
  });

  it('la directora ve solo su estancia', () => {
    expect(resolveReportScope({ userId: 3, assignments: [{ role: 'DIRECTORA', estanciaId: 7 }] })).toEqual({ kind: 'LIMITED', regions: [], estanciaIds: [7] });
  });

  it('los roles sin permiso de reportes no aportan alcance', () => {
    expect(resolveReportScope({ userId: 4, assignments: [{ role: 'DOCENTE', estanciaId: 7 }, { role: 'MEDICO', estanciaId: 7 }] })).toEqual({ kind: 'LIMITED', regions: [], estanciaIds: [] });
  });

  it('un rol global anula cualquier acotamiento', () => {
    expect(resolveReportScope({ userId: 5, assignments: [{ role: 'DIRECTORA', estanciaId: 7 }, { role: 'ADMIN_CENTRAL', estanciaId: null }] })).toEqual({ kind: 'ALL' });
  });
});

describe('DashboardService', () => {
  let repo: FakeRepo;
  let service: DashboardService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new DashboardService(repo);
  });

  it('calcula pendientes, tasa y color de cada estancia', async () => {
    repo.rows = [facts(1, { enrolled: 20, present: 17, absent: 1, other: 1 })];
    const { estancias } = await service.dashboard(authOf(admin), { date: '2026-10-15' });
    expect(estancias[0]).toMatchObject({ enrolled: 20, present: 17, absent: 1, other: 1, pending: 1, rate: 0.85, light: 'AMARILLO' });
  });

  it('una estancia sin jornada ese día queda SIN_CAPTURA y no cuenta en la tasa global', async () => {
    repo.rows = [facts(1, { enrolled: 10, present: 10, absent: 0, other: 0 }), facts(2, { hasJourney: false, enrolled: 0, present: 0, absent: 0, other: 0 })];
    const { estancias, totals } = await service.dashboard(authOf(admin), { date: '2026-10-15' });
    expect(estancias.find((row) => row.estanciaId === 2)).toMatchObject({ light: 'SIN_CAPTURA', rate: null });
    expect(totals).toMatchObject({ estancias: 2, enrolled: 10, present: 10, rate: 1, lights: { VERDE: 1, AMARILLO: 0, ROJO: 0, SIN_CAPTURA: 1 } });
  });

  it('con jornada pero sin inscritos tampoco hay tasa', async () => {
    repo.rows = [facts(1, { enrolled: 0, present: 0, absent: 0, other: 0 })];
    const { estancias } = await service.dashboard(authOf(admin), { date: '2026-10-15' });
    expect(estancias[0]).toMatchObject({ rate: null, light: 'SIN_CAPTURA' });
  });

  it('ordena por lo que pide atención: rojo, amarillo, sin captura y verde', async () => {
    repo.rows = [
      facts(1, { name: 'Verde', present: 20, absent: 0 }),
      facts(2, { name: 'Sin captura', hasJourney: false }),
      facts(3, { name: 'Rojo', present: 10, absent: 10 }),
      facts(4, { name: 'Amarillo', present: 16, absent: 4 }),
    ];
    const { estancias } = await service.dashboard(authOf(admin), { date: '2026-10-15' });
    expect(estancias.map((row) => row.name)).toEqual(['Rojo', 'Amarillo', 'Sin captura', 'Verde']);
  });

  it('pasa al repositorio el alcance del usuario', async () => {
    const supervisor: Principal = { userId: 2, assignments: [{ role: 'SUPERVISOR_CENTRAL', estanciaId: null, region: 'Norte' }] };
    await service.dashboard(authOf(supervisor), { date: '2026-10-15' });
    expect(repo.lastScope).toEqual({ kind: 'LIMITED', regions: ['Norte'], estanciaIds: [] });
  });

  it('los pendientes nunca son negativos', async () => {
    repo.rows = [facts(1, { enrolled: 5, present: 5, absent: 1, other: 0 })];
    const { estancias } = await service.dashboard(authOf(admin), { date: '2026-10-15' });
    expect(estancias[0]?.pending).toBe(0);
  });

  it('la respuesta no trae nada identificable de infantes', async () => {
    repo.rows = [facts(1)];
    const response = await service.dashboard(authOf(admin), { date: '2026-10-15' });
    expect(JSON.stringify(response)).not.toMatch(/matricula|curp|childName|telefono/i);
  });
});
