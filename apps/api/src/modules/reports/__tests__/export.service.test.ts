import type { Principal } from '@sirai/auth';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { ReportsRepository } from '../repositories/reports.repository.js';
import type { PeriodFacts, ReportScope } from '../reports.types.js';
import { ReportExportService } from '../services/export.service.js';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const admin: Principal = { userId: 1, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] };
const auth = (principal: Principal): AuthContext => ({ sessionId: 1, userId: principal.userId, principal, activeEstanciaId: null });
const NOW = new Date('2026-11-01T12:00:00Z');

class FakeRepo implements ReportsRepository {
  scope: ReportScope | null = null;
  range: { from: string; to: string } | null = null;
  facts: PeriodFacts = { estancias: [{ estanciaId: 1, code: 'EBDI-01', name: 'Estancia Uno', region: 'Norte' }], days: [{ estanciaId: 1, date: '2026-10-05', present: 9, absent: 1, other: 0 }] };
  dashboardFacts(): Promise<never[]> {
    return Promise.resolve([]);
  }
  periodFacts(range: { from: string; to: string }, scope: ReportScope): Promise<PeriodFacts> {
    this.range = range;
    this.scope = scope;
    return Promise.resolve(this.facts);
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

describe('ReportExportService (RF-17)', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: ReportExportService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    service = new ReportExportService(repo, audit as unknown as AuditService, () => NOW);
  });

  it('exporta el corte mensual en Excel con su nombre y tipo de contenido', async () => {
    const file = await service.export(auth(admin), { period: 'MONTH', date: '2026-10-15', format: 'xlsx' }, request);
    expect(file.filename).toBe('sirai-asistencia-mensual-2026-10-01_2026-10-31.xlsx');
    expect(file.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(file.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(repo.range).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('exporta el corte trimestral y el diario en PDF', async () => {
    const quarter = await service.export(auth(admin), { period: 'QUARTER', date: '2026-10-15', format: 'pdf' }, request);
    expect(quarter.filename).toBe('sirai-asistencia-trimestral-2026-10-01_2026-12-31.pdf');
    expect(quarter.contentType).toBe('application/pdf');
    expect(quarter.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const daily = await service.export(auth(admin), { period: 'DAY', date: '2026-10-15', format: 'pdf' }, request);
    expect(daily.filename).toBe('sirai-asistencia-diario-2026-10-15.pdf');
  });

  it('acota el reporte al alcance de quien lo pide', async () => {
    const supervisor: Principal = { userId: 2, assignments: [{ role: 'SUPERVISOR_CENTRAL', estanciaId: null, region: 'Norte' }] };
    await service.export(auth(supervisor), { period: 'DAY', date: '2026-10-15', format: 'xlsx' }, request);
    expect(repo.scope).toEqual({ kind: 'LIMITED', regions: ['Norte'], estanciaIds: [] });
  });

  it('audita la exportación con el corte, el formato y el rol, sin datos de menores', async () => {
    await service.export(auth(admin), { period: 'MONTH', date: '2026-10-15', format: 'pdf' }, request);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'REPORTE_EXPORTADO',
      userId: 1,
      roleCode: 'ADMIN_CENTRAL',
      tableName: 'reportes',
      after: { period: 'MONTH', from: '2026-10-01', to: '2026-10-31', format: 'pdf', estancias: 1 },
    });
  });
});
