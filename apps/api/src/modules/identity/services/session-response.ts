import { permissionsFor } from '@sirai/auth';
import type { SessionResponse } from '@sirai/contracts';
import { type EstanciaSummaryRecord, principalOf, type UserRecord } from '../identity.types';

/** Un usuario accede a una estancia si tiene rol ahí o un rol global. */
export const hasAccessToEstancia = (user: UserRecord, estanciaId: number): boolean =>
  user.assignments.some((a) => a.estanciaId === estanciaId || a.estanciaId === null);

export const hasGlobalAssignment = (user: UserRecord): boolean => user.assignments.some((a) => a.estanciaId === null);

/** Códigos de rol ordenados y sin duplicados, para la columna `rol_codigo` de auditoría. */
export const rolesSummary = (assignments: readonly { readonly role: string }[]): string | null => {
  const codes = [...new Set(assignments.map((a) => a.role))].sort();
  return codes.length > 0 ? codes.join(',') : null;
};

/** Estancia inicial de una sesión: la predeterminada si aplica, o la única asignada. */
export function initialEstanciaFor(user: UserRecord): number | null {
  if (user.defaultEstanciaId !== null && hasAccessToEstancia(user, user.defaultEstanciaId)) {
    return user.defaultEstanciaId;
  }
  const scoped = [...new Set(user.assignments.flatMap((a) => (a.estanciaId === null ? [] : [a.estanciaId])))];
  return scoped.length === 1 ? (scoped[0] ?? null) : null;
}

export function buildSessionResponse(
  user: UserRecord,
  activeEstancia: EstanciaSummaryRecord | null,
  availableEstancias: readonly EstanciaSummaryRecord[],
): SessionResponse {
  const principal = principalOf(user);
  return {
    user: { id: user.id, name: user.name, email: user.email },
    assignments: user.assignments.map(({ role, estanciaId, estanciaName }) => ({ role, estanciaId, estanciaName })),
    activeEstancia,
    availableEstancias: [...availableEstancias],
    permissions: permissionsFor(principal, { estanciaId: activeEstancia?.id ?? null }),
  };
}
