import { Controller, Get, Req, Res, StreamableFile } from '@nestjs/common';
import { type DashboardQuery, type DashboardResponse, dashboardQuerySchema, type ExportQuery, exportQuerySchema } from '@sirai/contracts';
import type { Response } from 'express';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { ZodQuery } from '../../../common/validation/zod-query.decorator.js';
import { DashboardService } from '../services/dashboard.service.js';
import { ReportExportService } from '../services/export.service.js';

@Controller('reportes')
export class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly exports: ReportExportService,
  ) {}

  /** Tablero semaforizado: conteos y porcentajes por estancia, sin datos identificables. */
  @Get('tablero')
  @RequirePermission('REPORTE_AGREGADO_CONSULTAR')
  get(@CurrentAuth() auth: AuthContext, @ZodQuery(dashboardQuerySchema) query: DashboardQuery): Promise<DashboardResponse> {
    return this.dashboard.dashboard(auth, query);
  }

  /** Cortes diario, mensual o trimestral en Excel o PDF: solo conteos y porcentajes, acotados al alcance del usuario. */
  @Get('exportacion')
  @RequirePermission('REPORTE_AGREGADO_CONSULTAR')
  async export(
    @CurrentAuth() auth: AuthContext,
    @ZodQuery(exportQuerySchema) query: ExportQuery,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.exports.export(auth, query, extractRequestContext(request));
    response.set({ 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' });
    return new StreamableFile(file.buffer);
  }
}
