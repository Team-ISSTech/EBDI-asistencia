import type { AuditExecutor } from '../../../common/audit/audit.service';
import type {
  AssignmentInput,
  EstanciaSummaryRecord,
  LockoutPolicy,
  NewSession,
  NewUser,
  QueryScope,
  SessionRecord,
  UserRecord,
} from '../identity.types';

/**
 * Interfaces de persistencia del módulo. Los servicios dependen de estas
 * interfaces; las implementaciones Drizzle y las de memoria (pruebas) son
 * intercambiables.
 */
export interface UsersRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: number): Promise<UserRecord | null>;
  list(scope: QueryScope): Promise<UserRecord[]>;
  /**
   * Alta atómica: usuario + asignaciones + lo que haga `inSameTransaction`
   * (la auditoría). Lanza CONFLICTO si el correo ya existe.
   */
  createWithAssignments(
    user: NewUser,
    assignments: readonly AssignmentInput[],
    now: Date,
    inSameTransaction?: TransactionHook<number>,
  ): Promise<number>;
  /** Cierra (vigente_hasta) las asignaciones que sobran e inserta las nuevas. Nunca borra. */
  replaceAssignments(
    userId: number,
    assignments: readonly AssignmentInput[],
    now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void>;
  /**
   * Guarda la contraseña nueva, quita la marca de temporal, limpia los intentos
   * fallidos y revoca todas las sesiones salvo `keepSessionId`, todo en una
   * transacción junto con lo que haga `inSameTransaction` (la auditoría).
   */
  changePassword(userId: number, passwordHash: string, now: Date, keepSessionId: number | null, inSameTransaction?: TransactionHook<void>): Promise<void>;
  /**
   * Baja lógica (RNF-04): marca `deleted_at` y `deleted_by`, deja la cuenta inactiva y
   * revoca todas sus sesiones, en una transacción con lo que haga `inSameTransaction`.
   * Sus asignaciones y su rastro en la bitácora se conservan.
   */
  softDelete(userId: number, byUserId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  /** Restablecimiento por un administrador: contraseña temporal nueva, cuenta desbloqueada y todas las sesiones revocadas. */
  setTemporaryPassword(userId: number, passwordHash: string, expiresAt: Date, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  registerFailedLogin(userId: number, policy: LockoutPolicy, now: Date): Promise<{ locked: boolean }>;
  /** Reinicia el contador de fallos; acepta el ejecutor de una transacción en curso. */
  registerSuccessfulLogin(userId: number, now: Date, executor?: AuditExecutor): Promise<void>;
}

/** Trabajo adicional dentro de la misma transacción (por ejemplo, auditar). */
export type TransactionHook<T> = (executor: AuditExecutor, result: T) => Promise<void>;

export interface SessionsRepository {
  create(session: NewSession, inSameTransaction?: TransactionHook<number>): Promise<number>;
  findActiveByTokenHash(tokenHash: Buffer, now: Date): Promise<SessionRecord | null>;
  /** Extiende la expiración; se llama solo cuando pasó el intervalo mínimo desde el último uso. */
  touch(id: number, lastUsedAt: Date, expiresAt: Date): Promise<void>;
  revoke(id: number, at: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  setActiveEstancia(id: number, estanciaId: number, inSameTransaction?: TransactionHook<void>): Promise<void>;
}

export interface EstanciasRepository {
  findById(id: number): Promise<EstanciaSummaryRecord | null>;
  listActive(): Promise<EstanciaSummaryRecord[]>;
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
export const ESTANCIAS_REPOSITORY = Symbol('ESTANCIAS_REPOSITORY');
