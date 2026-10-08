import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error';
import { type AuthenticatedRequest, SESSION_RESOLVER, type SessionResolver } from './auth-context';
import { IS_PUBLIC } from './decorators';
import { readSessionCookie } from './session-cookie';

/** Carga la sesión desde la cookie; 401 si falta, expiró o fue revocada. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request);
    const auth = token ? await this.sessions.resolve(token) : null;
    if (!auth) throw new ApiError('NO_AUTENTICADO', 'Inicia sesión para continuar.');
    request.auth = auth;
    return true;
  }
}
