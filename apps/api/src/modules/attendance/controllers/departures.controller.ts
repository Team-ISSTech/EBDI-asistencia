import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  type AuthorizedPickupsResponse,
  type Incident,
  type IncidentListResponse,
  type RegisterDepartureRequest,
  type RegisterDepartureResponse,
  type RegisterIncidentRequest,
  registerDepartureRequestSchema,
  registerIncidentRequestSchema,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { ZodBody } from '../../../common/validation/zod-body.decorator.js';
import { DeparturesService } from '../services/departures.service.js';

/** Salida e incidencias de un infante en una jornada (S-27). */
@Controller('asistencia/jornadas/:journeyId/registros/:enrollmentId')
export class DeparturesController {
  constructor(private readonly departures: DeparturesService) {}

  @Get('autorizados')
  @RequirePermission('ASISTENCIA_REGISTRAR')
  async authorizedPickups(
    @CurrentAuth() auth: AuthContext,
    @Param('journeyId', ParseIntPipe) journeyId: number,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Req() request: RequestWithId,
  ): Promise<AuthorizedPickupsResponse> {
    return { guardians: await this.departures.authorizedPickups(auth, journeyId, enrollmentId, extractRequestContext(request)) };
  }

  @Post('salida')
  @HttpCode(200)
  @RequirePermission('ASISTENCIA_REGISTRAR')
  registerDeparture(
    @CurrentAuth() auth: AuthContext,
    @Param('journeyId', ParseIntPipe) journeyId: number,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @ZodBody(registerDepartureRequestSchema) body: RegisterDepartureRequest,
    @Req() request: RequestWithId,
  ): Promise<RegisterDepartureResponse> {
    return this.departures.registerDeparture(auth, journeyId, enrollmentId, body, extractRequestContext(request));
  }

  @Get('incidencias')
  @RequirePermission('ASISTENCIA_CONSULTAR')
  async incidents(
    @CurrentAuth() auth: AuthContext,
    @Param('journeyId', ParseIntPipe) journeyId: number,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
  ): Promise<IncidentListResponse> {
    return { incidents: await this.departures.listIncidents(auth, journeyId, enrollmentId) };
  }

  @Get('incidencias/detalle')
  @RequirePermission('NOTA_SENSIBLE_CONSULTAR')
  async incidentDetails(
    @CurrentAuth() auth: AuthContext,
    @Param('journeyId', ParseIntPipe) journeyId: number,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Req() request: RequestWithId,
  ): Promise<IncidentListResponse> {
    return { incidents: await this.departures.listIncidentDetails(auth, journeyId, enrollmentId, extractRequestContext(request)) };
  }

  @Post('incidencias')
  @RequirePermission('ASISTENCIA_REGISTRAR')
  registerIncident(
    @CurrentAuth() auth: AuthContext,
    @Param('journeyId', ParseIntPipe) journeyId: number,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @ZodBody(registerIncidentRequestSchema) body: RegisterIncidentRequest,
    @Req() request: RequestWithId,
  ): Promise<Incident> {
    return this.departures.registerIncident(auth, journeyId, enrollmentId, body, extractRequestContext(request));
  }
}
