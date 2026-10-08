import type { RoleCode } from './roles.js';

/**
 * Asignación de un rol a un usuario. `estanciaId: null` significa alcance
 * global (roles centrales); un número limita el rol a esa estancia.
 */
export interface RoleAssignment {
  readonly role: RoleCode;
  readonly estanciaId: number | null;
}

/** Identidad autenticada tal como la ven las políticas de autorización. */
export interface Principal {
  readonly userId: number;
  readonly assignments: readonly RoleAssignment[];
}

/** Contexto en el que se evalúa un permiso: la estancia activa de la sesión. */
export interface Scope {
  readonly estanciaId: number | null;
}
