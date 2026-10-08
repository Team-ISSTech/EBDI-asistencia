import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type PermissionCode } from '@sirai/auth';
import { ApiError } from '../errors/api-error';
import type { AuthenticatedRequest } from './auth-context';
import { IS_AUTHENTICATED, IS_PUBLIC, REQUIRED_PERMISSION } from './decorators';

/**
 * Cerrado por defecto: una ruta sin `@Public`, `@Authenticated` ni
 * `@RequirePermission` se niega y se registra, para que olvidar el
 * decorador en un controlador nuevo nunca abra datos.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!auth) throw new ApiError('NO_AUTENTICADO', 'Inicia sesión para continuar.');
    const required = this.reflector.getAllAndOverride<PermissionCode | undefined>(REQUIRED_PERMISSION, targets);
    if (required) {
      if (can(auth.principal, required, { estanciaId: auth.activeEstanciaId })) return true;
      throw new ApiError('SIN_PERMISO', 'No tienes permiso para esta operación en la estancia activa.');
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED, targets)) return true;
    this.logger.error(`Ruta sin marca de autorización: ${context.getClass().name}.${context.getHandler().name}`);
    throw new ApiError('SIN_PERMISO', 'Operación no disponible.');
  }
}
