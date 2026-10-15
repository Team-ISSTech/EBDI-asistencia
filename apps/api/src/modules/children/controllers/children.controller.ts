import { Controller, Get, Post, Req } from '@nestjs/common';
import {
  type Child,
  type ChildListResponse,
  type EnrollChildRequest,
  enrollChildRequestSchema,
  type RoomListResponse,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { ChildrenService } from '../services/children.service';

@Controller()
export class ChildrenController {
  constructor(private readonly children: ChildrenService) {}

  @Get('salas')
  @RequirePermission('INFANTE_CONSULTAR')
  async listRooms(@CurrentAuth() auth: AuthContext): Promise<RoomListResponse> {
    return { rooms: await this.children.listRooms(auth) };
  }

  @Get('infantes')
  @RequirePermission('INFANTE_CONSULTAR')
  async list(@CurrentAuth() auth: AuthContext, @Req() request: RequestWithId): Promise<ChildListResponse> {
    return { children: await this.children.list(auth, extractRequestContext(request)) };
  }

  @Post('infantes')
  @RequirePermission('INFANTE_ADMINISTRAR')
  enroll(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(enrollChildRequestSchema) body: EnrollChildRequest,
    @Req() request: RequestWithId,
  ): Promise<Child> {
    return this.children.enroll(auth, body, extractRequestContext(request));
  }
}
