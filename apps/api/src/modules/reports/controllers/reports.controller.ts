import { Controller, Get } from '@nestjs/common';
import { type DashboardQuery, type DashboardResponse, dashboardQuerySchema } from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { ZodQuery } from '../../../common/validation/zod-query.decorator.js';
import { DashboardService } from '../services/dashboard.service.js';

@Controller('reportes')
export class ReportsController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Tablero semaforizado: conteos y porcentajes por estancia, sin datos identificables. */
  @Get('tablero')
  @RequirePermission('REPORTE_AGREGADO_CONSULTAR')
  get(@CurrentAuth() auth: AuthContext, @ZodQuery(dashboardQuerySchema) query: DashboardQuery): Promise<DashboardResponse> {
    return this.dashboard.dashboard(auth, query);
  }
}
