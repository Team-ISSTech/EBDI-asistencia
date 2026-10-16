import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, Res, StreamableFile } from '@nestjs/common';
import { type VerifyDossierRequest, type VerifyDossierResponse, verifyDossierRequestSchema } from '@sirai/contracts';
import type { Response } from 'express';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators.js';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context.js';
import { ZodBody } from '../../../common/validation/zod-body.decorator.js';
import { DossierService } from '../services/dossier.service.js';

@Controller('expedientes')
export class DossiersController {
  constructor(private readonly dossiers: DossierService) {}

  /** Verifica el folio y el sello impresos en un expediente recibido; no devuelve datos del infante. */
  @Post('verificar')
  @HttpCode(200)
  @RequirePermission('EXPEDIENTE_EXPORTAR')
  verify(@CurrentAuth() auth: AuthContext, @ZodBody(verifyDossierRequestSchema) body: VerifyDossierRequest, @Req() request: RequestWithId): Promise<VerifyDossierResponse> {
    return this.dossiers.verify(auth, body, extractRequestContext(request));
  }

  /** Expediente completo del infante en PDF, foliado y sellado. Contiene datos sensibles: solo la directora lo emite. */
  @Get(':childId')
  @RequirePermission('EXPEDIENTE_EXPORTAR')
  async export(
    @CurrentAuth() auth: AuthContext,
    @Param('childId', ParseIntPipe) childId: number,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.dossiers.export(auth, childId, extractRequestContext(request));
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' });
    return new StreamableFile(file.buffer);
  }
}
