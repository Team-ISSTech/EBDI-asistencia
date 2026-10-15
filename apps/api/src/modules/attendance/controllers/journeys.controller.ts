import { Controller, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { type AttendanceJourney, type OpenAttendanceJourneyRequest, openAttendanceJourneyRequestSchema } from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { ZodBody } from '../../../common/validation/zod-body.decorator.js';
import { JourneysService } from '../services/journeys.service.js';

@Controller('asistencia/jornadas')
export class JourneysController {
  constructor(private readonly journeys: JourneysService) {}

  @Post()
  @RequirePermission('ASISTENCIA_REGISTRAR')
  open(@CurrentAuth() auth: AuthContext, @ZodBody(openAttendanceJourneyRequestSchema) body: OpenAttendanceJourneyRequest, @Req() request: RequestWithId): Promise<AttendanceJourney> {
    return this.journeys.open(auth, body, extractRequestContext(request));
  }

  @Post(':id/cierre')
  @RequirePermission('JORNADA_CERRAR')
  close(@CurrentAuth() auth: AuthContext, @Param('id', ParseIntPipe) id: number, @Req() request: RequestWithId): Promise<AttendanceJourney> {
    return this.journeys.close(auth, id, extractRequestContext(request));
  }
}
