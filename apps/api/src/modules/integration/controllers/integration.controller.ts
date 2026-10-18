import { Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  type DashboardQuery,
  type DashboardResponse,
  dashboardQuerySchema,
  type IntegrationTokenRequest,
  type IntegrationTokenResponse,
  integrationTokenRequestSchema,
} from '@sirai/contracts';
import { AuditService } from '../../../common/audit/audit.service';
import type { SystemContext } from '../../../common/auth/auth-context';
import { CurrentSystem, Public, RequireScope } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { ZodQuery } from '../../../common/validation/zod-query.decorator';
import { DashboardService } from '../../reports/services/dashboard.service';
import { SystemTokenService } from '../services/system-token.service';

/** API para sistemas externos (RF-37): se autentican con Bearer token, nunca con la cookie de una persona. */
@Controller('integracion')
export class IntegrationController {
  constructor(
    private readonly tokens: SystemTokenService,
    private readonly dashboard: DashboardService,
    private readonly audit: AuditService,
  ) {}

  /** Credenciales de máquina a cambio de un token de vida corta. Con límite por IP, igual que el login. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('token')
  @HttpCode(HttpStatus.OK)
  token(@ZodBody(integrationTokenRequestSchema) body: IntegrationTokenRequest, @Req() request: RequestWithId): Promise<IntegrationTokenResponse> {
    return this.tokens.issue(body, extractRequestContext(request));
  }

  /** Tablero de asistencia de todas las estancias: conteos y porcentajes, sin datos identificables (S-10). */
  @Get('tablero')
  @RequireScope('REPORTE_AGREGADO_LEER')
  async tablero(
    @CurrentSystem() system: SystemContext,
    @ZodQuery(dashboardQuerySchema) query: DashboardQuery,
    @Req() request: RequestWithId,
  ): Promise<DashboardResponse> {
    const result = await this.dashboard.dashboardFor({ kind: 'ALL' }, query);
    await this.audit.record({ userId: null, systemId: system.systemId, roleCode: null, action: 'SISTEMA_CONSULTA', tableName: 'reportes', recordId: null, after: { fields: ['tablero'] }, request: extractRequestContext(request) });
    return result;
  }
}
