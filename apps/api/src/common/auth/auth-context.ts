import type { IntegrationScope, Principal } from '@sirai/auth';
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

/** Lo que una petición de un sistema externo sabe de sí misma (RF-37). No tiene roles: solo alcances. */
export interface SystemContext {
  readonly systemId: number;
  readonly name: string;
  readonly scopes: readonly IntegrationScope[];
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  /** Presente solo en rutas de integración autenticadas con Bearer; nunca junto con `auth`. */
  system?: SystemContext;
}

/**
 * Contrato que el guard usa para resolver un token de sesión. Lo implementa
 * el módulo de identidad; `common/` no conoce esa implementación.
 */
export interface SessionResolver {
  resolve(token: string): Promise<AuthContext | null>;
}

export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');

/** Resuelve un Bearer token de sistema; `null` si no es válido. Puede lanzar 429 si el sistema excede su límite. */
export interface SystemResolver {
  resolve(token: string): Promise<SystemContext | null>;
}

export const SYSTEM_RESOLVER = Symbol('SYSTEM_RESOLVER');
