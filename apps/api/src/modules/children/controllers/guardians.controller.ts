import { Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  type ChildGuardian,
  type ChildGuardianListResponse,
  type CreateGuardianRequest,
  createGuardianRequestSchema,
  type Guardian,
  type GuardianPhoneResponse,
  type LinkGuardianRequest,
  linkGuardianRequestSchema,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { GuardiansService } from '../services/guardians.service';

@Controller()
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Post('tutores')
  @RequirePermission('INFANTE_ADMINISTRAR')
  create(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(createGuardianRequestSchema) body: CreateGuardianRequest,
    @Req() request: RequestWithId,
  ): Promise<Guardian> {
    return this.guardians.create(auth, body, extractRequestContext(request));
  }

  @Get('infantes/:childId/tutores')
  @RequirePermission('INFANTE_CONSULTAR')
  async listForChild(
    @CurrentAuth() auth: AuthContext,
    @Param('childId', ParseIntPipe) childId: number,
    @Req() request: RequestWithId,
  ): Promise<ChildGuardianListResponse> {
    return { guardians: await this.guardians.listForChild(auth, childId, extractRequestContext(request)) };
  }

  @Post('infantes/:childId/tutores')
  @RequirePermission('INFANTE_ADMINISTRAR')
  link(
    @CurrentAuth() auth: AuthContext,
    @Param('childId', ParseIntPipe) childId: number,
    @ZodBody(linkGuardianRequestSchema) body: LinkGuardianRequest,
    @Req() request: RequestWithId,
  ): Promise<ChildGuardian> {
    return this.guardians.link(auth, childId, body, extractRequestContext(request));
  }

  /** Teléfono completo: solo quien accede a notas familiares, y cada consulta se audita. */
  @Get('tutores/:guardianId/telefono')
  @RequirePermission('NOTA_SENSIBLE_CONSULTAR')
  revealPhone(
    @CurrentAuth() auth: AuthContext,
    @Param('guardianId', ParseIntPipe) guardianId: number,
    @Req() request: RequestWithId,
  ): Promise<GuardianPhoneResponse> {
    return this.guardians.revealPhone(auth, guardianId, extractRequestContext(request));
  }
}
