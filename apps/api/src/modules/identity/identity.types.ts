import type { Principal, RoleCode } from '@sirai/auth';
import type { UserStatus } from '@sirai/contracts';

/** Asignación de rol vigente, con el nombre de la estancia para la UI. */
export interface AssignmentRecord {
  readonly role: RoleCode;
  readonly estanciaId: number | null;
  readonly estanciaName: string | null;
  /** Región del supervisor (P9); nulo = sin acotar por región. */
  readonly region?: string | null;
}

export interface AssignmentInput {
  readonly role: RoleCode;
  readonly estanciaId: number | null;
}

export interface UserRecord {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly status: UserStatus;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
  readonly lastAccessAt: Date | null;
  readonly mustChangePassword: boolean;
  readonly temporaryPasswordExpiresAt: Date | null;
  readonly defaultEstanciaId: number | null;
  readonly assignments: readonly AssignmentRecord[];
}

export interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly mustChangePassword: boolean;
  readonly temporaryPasswordExpiresAt: Date | null;
  readonly defaultEstanciaId: number | null;
}

export interface LockoutPolicy {
  readonly maxAttempts: number;
  readonly lockMinutes: number;
}

export interface SessionRecord {
  readonly id: number;
  readonly userId: number;
  readonly activeEstanciaId: number | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
}

export interface NewSession {
  readonly userId: number;
  readonly tokenHash: Buffer;
  readonly activeEstanciaId: number | null;
  readonly expiresAt: Date;
  readonly ipAddress: Buffer | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface EstanciaSummaryRecord {
  readonly id: number;
  readonly name: string;
}

/** Alcance de consulta: `null` = todo el sistema; número = una estancia. */
export interface QueryScope {
  readonly estanciaId: number | null;
}

export const principalOf = (user: UserRecord): Principal => ({
  userId: user.id,
  assignments: user.assignments.map(({ role, estanciaId, region }) => ({ role, estanciaId, region: region ?? null })),
});
