import { Controller, Get, Req } from '@nestjs/common';
import type { FollowUpListResponse } from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { FollowUpsService } from '../services/follow-ups.service.js';

@Controller('seguimientos')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  @RequirePermission('SEGUIMIENTO_CONSULTAR')
  async list(@CurrentAuth() auth: AuthContext, @Req() request: RequestWithId): Promise<FollowUpListResponse> {
    return { followUps: await this.followUps.list(auth, extractRequestContext(request)) };
  }
}
