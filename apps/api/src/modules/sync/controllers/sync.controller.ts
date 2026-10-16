import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import { type SyncRequest, type SyncResponse, syncRequestSchema } from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { Authenticated, CurrentAuth } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { ZodBody } from '../../../common/validation/zod-body.decorator.js';
import { SyncService } from '../services/sync.service.js';

@Controller('sincronizacion')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /**
   * Operaciones capturadas sin conexión. Exige sesión, no un permiso fijo: cada
   * operación se autoriza por separado según su tipo. Es repetible: reenviar
   * el mismo lote devuelve los mismos acuses.
   */
  @Post()
  @Authenticated()
  @HttpCode(200)
  process(@CurrentAuth() auth: AuthContext, @ZodBody(syncRequestSchema) body: SyncRequest, @Req() request: RequestWithId): Promise<SyncResponse> {
    return this.sync.process(auth, body, extractRequestContext(request));
  }
}
