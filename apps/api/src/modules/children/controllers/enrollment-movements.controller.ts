import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  type EnrollmentMovementRequest,
  enrollmentMovementRequestSchema,
  type PendingTransferListResponse,
  type ReceiveTransferRequest,
  receiveTransferRequestSchema,
  type TransferDestinationListResponse,
} from '@sirai/contracts';
import type { AuthContext } from '../../../common/auth/auth-context';
import { CurrentAuth, RequirePermission } from '../../../common/auth/decorators';
import { extractRequestContext, type RequestWithId } from '../../../common/http/request-context';
import { ZodBody } from '../../../common/validation/zod-body.decorator';
import { EnrollmentMovementsService } from '../services/enrollment-movements.service';

/** Movimientos de la inscripción y traslados entre estancias (RF-35). */
@Controller()
export class EnrollmentMovementsController {
  constructor(private readonly movements: EnrollmentMovementsService) {}

  @Post('infantes/:childId/movimientos')
  @HttpCode(204)
  @RequirePermission('INFANTE_ADMINISTRAR')
  move(
    @CurrentAuth() auth: AuthContext,
    @Param('childId', ParseIntPipe) childId: number,
    @ZodBody(enrollmentMovementRequestSchema) body: EnrollmentMovementRequest,
    @Req() request: RequestWithId,
  ): Promise<void> {
    return this.movements.move(auth, childId, body, extractRequestContext(request));
  }

  @Get('traslados/destinos')
  @RequirePermission('INFANTE_ADMINISTRAR')
  async destinations(@CurrentAuth() auth: AuthContext): Promise<TransferDestinationListResponse> {
    return { estancias: await this.movements.destinations(auth) };
  }

  @Get('traslados/pendientes')
  @RequirePermission('INFANTE_ADMINISTRAR')
  async pending(@CurrentAuth() auth: AuthContext, @Req() request: RequestWithId): Promise<PendingTransferListResponse> {
    return { transfers: await this.movements.pendingTransfers(auth, extractRequestContext(request)) };
  }

  @Post('traslados/:enrollmentId/recepcion')
  @HttpCode(204)
  @RequirePermission('INFANTE_ADMINISTRAR')
  receive(
    @CurrentAuth() auth: AuthContext,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @ZodBody(receiveTransferRequestSchema) body: ReceiveTransferRequest,
    @Req() request: RequestWithId,
  ): Promise<void> {
    return this.movements.receive(auth, enrollmentId, body, extractRequestContext(request));
  }
}
