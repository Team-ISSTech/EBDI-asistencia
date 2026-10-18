import { Controller, Get, Req } from '@nestjs/common';
import { type AuditFiltersResponse, type AuditListResponse, type AuditQuery, auditQuerySchema } from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodQuery } from '../../../common/validation/zod-query.decorator';
import { AuditQueryService } from '../services/audit-query.service';

/** Consulta de la bitácora (RF-11). Solo lectura: la bitácora no se edita ni se borra. */
@Controller('auditoria')
@RequirePermission('AUDITORIA_CONSULTAR')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @ZodQuery(auditQuerySchema) query: AuditQuery, @Req() request: RequestWithId): Promise<AuditListResponse> {
    return this.audit.list(auth, query, extractRequestContext(request));
  }

  @Get('filtros')
  filters(): Promise<AuditFiltersResponse> {
    return this.audit.filters();
  }
}
