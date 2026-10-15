import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  type Consent,
  type ConsentListResponse,
  type RegisterConsentRequest,
  registerConsentRequestSchema,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { ConsentsService } from '../services/consents.service';

@Controller()
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get('infantes/:childId/consentimientos')
  @RequirePermission('INFANTE_CONSULTAR')
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param('childId', ParseIntPipe) childId: number,
    @Req() request: RequestWithId,
  ): Promise<ConsentListResponse> {
    return { consents: await this.consents.list(auth, childId, extractRequestContext(request)) };
  }

  @Post('infantes/:childId/consentimientos')
  @RequirePermission('CONSENTIMIENTO_REGISTRAR')
  register(
    @CurrentAuth() auth: AuthContext,
    @Param('childId', ParseIntPipe) childId: number,
    @ZodBody(registerConsentRequestSchema) body: RegisterConsentRequest,
    @Req() request: RequestWithId,
  ): Promise<Consent> {
    return this.consents.register(auth, childId, body, extractRequestContext(request));
  }

  @Post('consentimientos/:consentId/revocar')
  @HttpCode(200)
  @RequirePermission('CONSENTIMIENTO_REGISTRAR')
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('consentId', ParseIntPipe) consentId: number,
    @Req() request: RequestWithId,
  ): Promise<Consent> {
    return this.consents.revoke(auth, consentId, extractRequestContext(request));
  }
}
