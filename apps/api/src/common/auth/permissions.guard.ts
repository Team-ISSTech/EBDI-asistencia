import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type IntegrationScope, type PermissionCode } from '@sirai/auth';
import { ApiError } from '../errors/api-error';
import type { AuthenticatedRequest } from './auth-context';
import { ALLOWS_PASSWORD_PENDING, IS_AUTHENTICATED, IS_PUBLIC, REQUIRED_PERMISSION, REQUIRED_SCOPE } from './decorators';

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
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const scope = this.reflector.getAllAndOverride<IntegrationScope | undefined>(REQUIRED_SCOPE, targets);
    if (scope) return this.checkScope(request, scope);
    const { auth } = request;
    if (!auth) throw new ApiError('NO_AUTENTICADO', 'Inicia sesión para continuar.');
    if (auth.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOWS_PASSWORD_PENDING, targets)) {
      throw new ApiError('CAMBIO_CONTRASENA_REQUERIDO', 'Cambia tu contraseña temporal para continuar.');
    }
    const required = this.reflector.getAllAndOverride<PermissionCode | undefined>(REQUIRED_PERMISSION, targets);
    if (required) {
      if (can(auth.principal, required, { estanciaId: auth.activeEstanciaId })) return true;
      throw new ApiError('SIN_PERMISO', 'No tienes permiso para esta operación en la estancia activa.');
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED, targets)) return true;
    this.logger.error(`Ruta sin marca de autorización: ${context.getClass().name}.${context.getHandler().name}`);
    throw new ApiError('SIN_PERMISO', 'Operación no disponible.');
  }

  /** Ruta de integración: solo cuenta lo que concede el token de un sistema, nunca los roles de una persona. */
  private checkScope(request: AuthenticatedRequest, scope: IntegrationScope): boolean {
    if (!request.system) throw new ApiError('NO_AUTENTICADO', 'Token inválido, vencido o revocado.');
    if (request.system.scopes.includes(scope)) return true;
    throw new ApiError('SIN_PERMISO', 'El sistema no tiene el alcance necesario para esta operación.');
  }
}
