import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  type ContactListResponse,
  type FollowUp,
  type FollowUpListResponse,
  type RegisterContactRequest,
  type RegisterMedicalReleaseRequest,
  registerContactRequestSchema,
  registerMedicalReleaseRequestSchema,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { ZodBody } from '../../../common/validation/zod-body.decorator.js';
import { FollowUpsService } from '../services/follow-ups.service.js';

@Controller('seguimientos')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  @RequirePermission('SEGUIMIENTO_CONSULTAR')
  async list(@CurrentAuth() auth: AuthContext, @Req() request: RequestWithId): Promise<FollowUpListResponse> {
    return { followUps: await this.followUps.list(auth, extractRequestContext(request)) };
  }

  @Post(':id/contactos')
  @HttpCode(201)
  @RequirePermission('SEGUIMIENTO_REGISTRAR')
  registerContact(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @ZodBody(registerContactRequestSchema) body: RegisterContactRequest,
    @Req() request: RequestWithId,
  ): Promise<FollowUp> {
    return this.followUps.registerContact(auth, id, body, extractRequestContext(request));
  }

  /** Historial con notas de asesoría: exige el permiso de notas sensibles, y cada consulta se audita. */
  @Get(':id/contactos')
  @RequirePermission('NOTA_SENSIBLE_CONSULTAR')
  async listContacts(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestWithId,
  ): Promise<ContactListResponse> {
    return { contacts: await this.followUps.listContacts(auth, id, extractRequestContext(request)) };
  }

  /** RF-30: solo quien tiene `ALTA_MEDICA_REGISTRAR` (el médico de estancia) libera el candado. */
  @Post(':id/alta')
  @HttpCode(201)
  @RequirePermission('ALTA_MEDICA_REGISTRAR')
  registerRelease(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @ZodBody(registerMedicalReleaseRequestSchema) body: RegisterMedicalReleaseRequest,
    @Req() request: RequestWithId,
  ): Promise<FollowUp> {
    return this.followUps.registerRelease(auth, id, body, extractRequestContext(request));
  }

  @Post(':id/cierre')
  @HttpCode(201)
  @RequirePermission('SEGUIMIENTO_REGISTRAR')
  close(@CurrentAuth() auth: AuthContext, @Param('id', ParseIntPipe) id: number, @Req() request: RequestWithId): Promise<FollowUp> {
    return this.followUps.close(auth, id, extractRequestContext(request));
  }
}
