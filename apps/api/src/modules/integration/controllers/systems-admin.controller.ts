import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { type CreatedSystemResponse, type CreateSystemRequest, createSystemRequestSchema, type SystemListResponse } from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { SystemsAdminService } from '../services/systems-admin.service';

/** Alta, consulta y revocación de sistemas externos, a cargo del administrador central. */
@Controller('administracion/sistemas')
@RequirePermission('SISTEMA_ADMINISTRAR')
export class SystemsAdminController {
  constructor(private readonly systems: SystemsAdminService) {}

  @Get()
  async list(): Promise<SystemListResponse> {
    return { systems: await this.systems.list() };
  }

  /** El secreto sale en esta respuesta y en ninguna otra. */
  @Post()
  create(@CurrentAuth() auth: AuthContext, @ZodBody(createSystemRequestSchema) body: CreateSystemRequest, @Req() request: RequestWithId): Promise<CreatedSystemResponse> {
    return this.systems.create(auth, body, extractRequestContext(request));
  }

  @Post(':id/revocar')
  @HttpCode(204)
  revoke(@CurrentAuth() auth: AuthContext, @Param('id', ParseIntPipe) id: number, @Req() request: RequestWithId): Promise<void> {
    return this.systems.revoke(auth, id, extractRequestContext(request));
  }
}
