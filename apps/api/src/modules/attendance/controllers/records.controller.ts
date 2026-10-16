import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  type MarkAttendanceRequest,
  type MarkAttendanceResponse,
  markAttendanceRequestSchema,
  type RosterResponse,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { ZodBody } from '../../../common/validation/zod-body.decorator.js';
import { AttendanceRecordsService } from '../services/records.service.js';

@Controller('asistencia/jornadas/:journeyId')
export class RecordsController {
  constructor(private readonly records: AttendanceRecordsService) {}

  @Get('lista')
  @RequirePermission('ASISTENCIA_CONSULTAR')
  async roster(
    @CurrentAuth() auth: AuthContext,
    @Param('journeyId', ParseIntPipe) journeyId: number,
    @Req() request: RequestWithId,
  ): Promise<RosterResponse> {
    return { entries: await this.records.roster(auth, journeyId, extractRequestContext(request)) };
  }

  @Post('registros')
  @HttpCode(200)
  @RequirePermission('ASISTENCIA_REGISTRAR')
  mark(
    @CurrentAuth() auth: AuthContext,
    @Param('journeyId', ParseIntPipe) journeyId: number,
    @ZodBody(markAttendanceRequestSchema) body: MarkAttendanceRequest,
    @Req() request: RequestWithId,
  ): Promise<MarkAttendanceResponse> {
    return this.records.mark(auth, journeyId, body, extractRequestContext(request));
  }
}
