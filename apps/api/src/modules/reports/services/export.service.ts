import { Inject, Injectable } from '@nestjs/common';
import type { ExportQuery } from '@sirai/contracts';
import { periodRange, type ReportPeriod } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import { buildPdf } from '../exports/pdf-builder.js';
import { buildWorkbook } from '../exports/xlsx-builder.js';
import { REPORTS_REPOSITORY, type ReportsRepository } from '../repositories/reports.repository.js';
import { buildPeriodReport } from './period-report.js';
import { resolveReportScope } from './dashboard.service.js';

export const REPORTS_CLOCK = Symbol('REPORTS_CLOCK');

const FILE_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

const PERIOD_FILE_NAMES: Readonly<Record<ReportPeriod, string>> = { DAY: 'diario', MONTH: 'mensual', QUARTER: 'trimestral' };

export interface ExportedFile {
  readonly filename: string;
  readonly contentType: string;
  readonly buffer: Buffer;
}

/**
 * Exportación de cortes de asistencia a Excel y PDF (RF-17). El archivo solo
 * trae conteos y porcentajes por estancia (RF-18) y se acota al alcance de
 * quien lo pide. Cada exportación queda auditada.
 */
@Injectable()
export class ReportExportService {
  constructor(
    @Inject(REPORTS_REPOSITORY) private readonly reports: ReportsRepository,
    private readonly audit: AuditService,
    @Inject(REPORTS_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  async export(auth: AuthContext, query: ExportQuery, request: RequestContext): Promise<ExportedFile> {
    const range = periodRange(query.period, query.date);
    const facts = await this.reports.periodFacts(range, resolveReportScope(auth.principal));
    const report = buildPeriodReport(query.period, range, facts.estancias, facts.days, this.clock());
    const buffer = query.format === 'xlsx' ? await buildWorkbook(report) : await buildPdf(report);
    await this.audit.record({
      userId: auth.userId,
      roleCode: auth.principal.assignments.map((assignment) => assignment.role).sort().join(',') || null,
      action: 'REPORTE_EXPORTADO',
      tableName: 'reportes',
      recordId: null,
      after: { period: query.period, from: range.from, to: range.to, format: query.format, estancias: report.summary.length },
      request,
    });
    const span = range.from === range.to ? range.from : `${range.from}_${range.to}`;
    return { filename: `sirai-asistencia-${PERIOD_FILE_NAMES[query.period]}-${span}.${query.format}`, contentType: FILE_TYPES[query.format], buffer };
  }
}
