import { ROLE_PERMISSIONS } from './matrix.js';
import type { PermissionCode } from './permissions.js';
import type { Principal, RoleAssignment, Scope } from './principal.js';

/**
 * Una asignación aplica al alcance si es global (null) o si su estancia es la
 * estancia activa. Una asignación de estancia nunca aplica sin estancia activa.
 */
const appliesTo = (assignment: RoleAssignment, scope: Scope): boolean =>
  assignment.estanciaId === null || assignment.estanciaId === scope.estanciaId;

/** Permisos efectivos del principal en el alcance dado, sin duplicados. */
export function permissionsFor(principal: Principal, scope: Scope): PermissionCode[] {
  const granted = principal.assignments
    .filter((assignment) => appliesTo(assignment, scope))
    .flatMap((assignment) => ROLE_PERMISSIONS[assignment.role]);
  return [...new Set(granted)];
}

/** Decide si el principal puede ejercer `permission` dentro de `scope`. */
export function can(principal: Principal, permission: PermissionCode, scope: Scope): boolean {
  return principal.assignments.some(
    (assignment) =>
      appliesTo(assignment, scope) && ROLE_PERMISSIONS[assignment.role].includes(permission),
  );
}
