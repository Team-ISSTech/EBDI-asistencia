import { Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import {
  type CreateEstanciaRequest,
  type CreateRoomRequest,
  createEstanciaRequestSchema,
  createRoomRequestSchema,
  type EstanciaAdmin,
  type EstanciaAdminListResponse,
  type RoomAdmin,
  type RoomAdminListResponse,
  type UpdateEstanciaRequest,
  type UpdateRoomRequest,
  updateEstanciaRequestSchema,
  updateRoomRequestSchema,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { EstanciasAdminService } from '../services/estancias-admin.service';
import { RoomsAdminService } from '../services/rooms-admin.service';

/** Catálogo de estancias (RF-31): solo el administrador central. */
@Controller('administracion/estancias')
@RequirePermission('ESTANCIA_ADMINISTRAR')
export class EstanciasAdminController {
  constructor(private readonly estancias: EstanciasAdminService) {}

  @Get()
  async list(): Promise<EstanciaAdminListResponse> {
    return { estancias: await this.estancias.list() };
  }

  @Post()
  create(@CurrentAuth() auth: AuthContext, @ZodBody(createEstanciaRequestSchema) body: CreateEstanciaRequest, @Req() request: RequestWithId): Promise<EstanciaAdmin> {
    return this.estancias.create(auth, body, extractRequestContext(request));
  }

  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @ZodBody(updateEstanciaRequestSchema) body: UpdateEstanciaRequest,
    @Req() request: RequestWithId,
  ): Promise<EstanciaAdmin> {
    return this.estancias.update(auth, id, body, extractRequestContext(request));
  }

  /** Baja lógica: la estancia deja de aparecer, nunca se borra la fila. */
  @Post(':id/baja')
  @HttpCode(204)
  async retire(@CurrentAuth() auth: AuthContext, @Param('id', ParseIntPipe) id: number, @Req() request: RequestWithId): Promise<void> {
    await this.estancias.retire(auth, id, extractRequestContext(request));
  }
}

/** Catálogo de salas y grupos de la estancia activa (RF-32): la directora. */
@Controller('administracion/salas')
@RequirePermission('SALA_ADMINISTRAR')
export class RoomsAdminController {
  constructor(private readonly rooms: RoomsAdminService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext): Promise<RoomAdminListResponse> {
    return { rooms: await this.rooms.list(auth) };
  }

  @Post()
  create(@CurrentAuth() auth: AuthContext, @ZodBody(createRoomRequestSchema) body: CreateRoomRequest, @Req() request: RequestWithId): Promise<RoomAdmin> {
    return this.rooms.create(auth, body, extractRequestContext(request));
  }

  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseIntPipe) id: number,
    @ZodBody(updateRoomRequestSchema) body: UpdateRoomRequest,
    @Req() request: RequestWithId,
  ): Promise<RoomAdmin> {
    return this.rooms.update(auth, id, body, extractRequestContext(request));
  }

  @Post(':id/baja')
  @HttpCode(204)
  async retire(@CurrentAuth() auth: AuthContext, @Param('id', ParseIntPipe) id: number, @Req() request: RequestWithId): Promise<void> {
    await this.rooms.retire(auth, id, extractRequestContext(request));
  }
}
