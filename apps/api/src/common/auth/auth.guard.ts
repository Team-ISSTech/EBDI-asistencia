import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error';
import { type AuthenticatedRequest, SESSION_RESOLVER, type SessionResolver, SYSTEM_RESOLVER, type SystemResolver } from './auth-context';
import { readBearerToken } from './bearer-token';
import { IS_PUBLIC, REQUIRED_SCOPE } from './decorators';
import { readSessionCookie } from './session-cookie';

const NOT_AUTHENTICATED = 'Inicia sesión para continuar.';

/**
 * Autentica según el tipo de ruta. Una ruta de integración (`@RequireScope`)
 * solo acepta el Bearer de un sistema; cualquier otra solo acepta la cookie de una
 * persona. Nunca se mezclan: un token de sistema no sirve donde sirve una sesión ni al revés.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver,
    @Inject(SYSTEM_RESOLVER) private readonly systems: SystemResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (this.reflector.getAllAndOverride<string | undefined>(REQUIRED_SCOPE, targets)) return this.authenticateSystem(request);
    const token = readSessionCookie(request);
    const auth = token ? await this.sessions.resolve(token) : null;
    if (!auth) throw new ApiError('NO_AUTENTICADO', NOT_AUTHENTICATED);
    request.auth = auth;
    return true;
  }

  private async authenticateSystem(request: AuthenticatedRequest): Promise<boolean> {
    const token = readBearerToken(request);
    const system = token ? await this.systems.resolve(token) : null;
    if (!system) throw new ApiError('NO_AUTENTICADO', 'Token inválido, vencido o revocado.');
    request.system = system;
    return true;
  }
}
