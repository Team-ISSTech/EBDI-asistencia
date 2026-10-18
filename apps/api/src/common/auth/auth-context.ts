import type { Principal } from '@sirai/auth';
import type { Request } from 'express';

/** Lo que una petición autenticada sabe de sí misma. */
export interface AuthContext {
  readonly sessionId: number;
  readonly userId: number;
  readonly principal: Principal;
  readonly activeEstanciaId: number | null;
  /** Contraseña temporal sin cambiar: la sesión solo puede cambiarla o cerrarse (RF-38). */
  readonly mustChangePassword?: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/**
 * Contrato que el guard usa para resolver un token de sesión. Lo implementa
 * el módulo de identidad; `common/` no conoce esa implementación.
 */
export interface SessionResolver {
  resolve(token: string): Promise<AuthContext | null>;
}

export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');
