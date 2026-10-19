import type { ApiEnv } from '@sirai/config';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
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
import type { EstanciasRepository, SessionsRepository, TransactionHook, UsersRepository } from '../repositories/repositories';
import { PasswordHasher } from '../services/password-hasher';

const MS_PER_MINUTE = 60_000;

/** Dobles en memoria que cumplen las mismas interfaces que los repositorios Drizzle. */
export class InMemoryUsers implements UsersRepository {
  readonly rows = new Map<number, UserRecord>();
  private nextId = 1;

  seed(user: Omit<UserRecord, 'id'> & { id?: number }): UserRecord {
    const id = user.id ?? this.nextId++;
    this.nextId = Math.max(this.nextId, id + 1);
    const record = { ...user, id };
    this.rows.set(id, record);
    return record;
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve([...this.rows.values()].find((u) => u.email === email) ?? null);
  }

  findById(id: number): Promise<UserRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  list(scope: QueryScope): Promise<UserRecord[]> {
    const all = [...this.rows.values()];
    if (scope.estanciaId === null) return Promise.resolve(all);
    return Promise.resolve(all.filter((u) => u.assignments.some((a) => a.estanciaId === scope.estanciaId)));
  }

  /** Los dobles no tienen transacción; el gancho recibe un ejecutor vacío. */
  private readonly executor = {} as Parameters<TransactionHook<unknown>>[0];

  async createWithAssignments(
    user: NewUser,
    assignments: readonly AssignmentInput[],
    _now: Date,
    inSameTransaction?: TransactionHook<number>,
  ): Promise<number> {
    if ([...this.rows.values()].some((u) => u.email === user.email)) {
      throw new ApiError('CONFLICTO', 'Ya existe un usuario con ese correo.');
    }
    const { id } = this.seed({ ...user, status: 'ACTIVO', failedAttempts: 0, lockedUntil: null, lastAccessAt: null, assignments: [] });
    await this.replaceAssignments(id, assignments, _now);
    await inSameTransaction?.(this.executor, id);
    return id;
  }

  async replaceAssignments(
    userId: number,
    assignments: readonly AssignmentInput[],
    _now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void> {
    const user = this.rows.get(userId);
    if (user) {
      this.rows.set(userId, { ...user, assignments: assignments.map((a) => ({ ...a, estanciaName: `Estancia ${a.estanciaId}` })) });
    }
    await inSameTransaction?.(this.executor, undefined);
  }

  /** Qué cambios de contraseña se pidieron, para comprobar que se revocan las demás sesiones. */
  readonly passwordChanges: { userId: number; keepSessionId: number | null }[] = [];

  async changePassword(userId: number, passwordHash: string, now: Date, keepSessionId: number | null, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const user = this.rows.get(userId);
    if (user) {
      this.rows.set(userId, { ...user, passwordHash, mustChangePassword: false, temporaryPasswordExpiresAt: null, failedAttempts: 0, lockedUntil: null });
    }
    this.passwordChanges.push({ userId, keepSessionId });
    void now;
    await inSameTransaction?.(this.executor, undefined);
  }

  async setTemporaryPassword(userId: number, passwordHash: string, expiresAt: Date, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const user = this.rows.get(userId);
    if (user) {
      this.rows.set(userId, { ...user, passwordHash, mustChangePassword: true, temporaryPasswordExpiresAt: expiresAt, failedAttempts: 0, lockedUntil: null });
    }
    this.passwordChanges.push({ userId, keepSessionId: null });
    void now;
    await inSameTransaction?.(this.executor, undefined);
  }

  readonly retired: { userId: number; byUserId: number }[] = [];

  async softDelete(userId: number, byUserId: number, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    this.rows.delete(userId);
    this.retired.push({ userId, byUserId });
    await inSameTransaction?.(this.executor, undefined);
  }

  registerFailedLogin(userId: number, policy: LockoutPolicy, now: Date): Promise<{ locked: boolean }> {
    const user = this.rows.get(userId);
    if (!user) return Promise.resolve({ locked: false });
    const attempts = user.failedAttempts + 1;
    const locked = attempts >= policy.maxAttempts;
    this.rows.set(userId, {
      ...user,
      failedAttempts: locked ? 0 : attempts,
      lockedUntil: locked ? new Date(now.getTime() + policy.lockMinutes * MS_PER_MINUTE) : null,
    });
    return Promise.resolve({ locked });
  }

  registerSuccessfulLogin(userId: number, now: Date): Promise<void> {
    const user = this.rows.get(userId);
    if (user) this.rows.set(userId, { ...user, failedAttempts: 0, lockedUntil: null, lastAccessAt: now });
    return Promise.resolve();
  }
}

export class InMemorySessions implements SessionsRepository {
  readonly rows = new Map<number, NewSession & { id: number; revokedAt: Date | null; lastUsedAt: Date }>();
  private nextId = 1;

  async create(session: NewSession, inSameTransaction?: TransactionHook<number>): Promise<number> {
    const id = this.nextId++;
    this.rows.set(id, { ...session, id, revokedAt: null, lastUsedAt: session.createdAt });
    await inSameTransaction?.({} as Parameters<TransactionHook<number>>[0], id);
    return id;
  }

  findActiveByTokenHash(tokenHash: Buffer, now: Date): Promise<SessionRecord | null> {
    const found = [...this.rows.values()].find(
      (s) => s.tokenHash.equals(tokenHash) && s.revokedAt === null && s.expiresAt > now,
    );
    if (!found) return Promise.resolve(null);
    const { id, userId, activeEstanciaId, expiresAt, createdAt, lastUsedAt } = found;
    return Promise.resolve({ id, userId, activeEstanciaId, expiresAt, createdAt, lastUsedAt });
  }

  touch(id: number, lastUsedAt: Date, expiresAt: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, lastUsedAt, expiresAt });
    return Promise.resolve();
  }

  async revoke(id: number, at: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, revokedAt: at });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  async setActiveEstancia(id: number, estanciaId: number, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, activeEstanciaId: estanciaId });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }
}

export class InMemoryEstancias implements EstanciasRepository {
  constructor(readonly rows: readonly EstanciaSummaryRecord[]) {}

  findById(id: number): Promise<EstanciaSummaryRecord | null> {
    return Promise.resolve(this.rows.find((e) => e.id === id) ?? null);
  }

  listActive(): Promise<EstanciaSummaryRecord[]> {
    return Promise.resolve([...this.rows]);
  }
}

/** Hasher determinista y rápido; solo para pruebas unitarias. */
export class FakeHasher extends PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hash:${plain}`);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return Promise.resolve(hash === `hash:${plain}`);
  }
}

export class RecordingAudit {
  readonly entries: AuditEntry[] = [];
  /** Cuántas entradas llegaron con la transacción de la operación. */
  transactional = 0;

  record(entry: AuditEntry, executor?: unknown): Promise<void> {
    this.entries.push(entry);
    if (executor !== undefined) this.transactional += 1;
    return Promise.resolve();
  }

  asService(): AuditService {
    return this as unknown as AuditService;
  }
}

export const testEnv: ApiEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: 'mysql://x:y@localhost:3306/z',
  SESSION_TTL_HOURS: 12,
  SESSION_MAX_HOURS: 72,
  LOGIN_MAX_ATTEMPTS: 3,
  LOGIN_LOCK_MINUTES: 15,
  LOGIN_RATE_LIMIT_PER_MINUTE: 10,
  TEMP_PASSWORD_DAYS: 7,
  INTEGRATION_TOKEN_MINUTES: 15,
  INTEGRATION_RATE_LIMIT_PER_MINUTE: 60,
  COOKIE_SECURE: false,
  TRUST_PROXY: false,
  WEB_ORIGIN: 'http://localhost:5173',
  DATA_ENCRYPTION_KEY: 'a'.repeat(64),
  FOLLOW_UP_JOB_SECONDS: 0,
};

export const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: null };

export const docenteRecord = (overrides: Partial<UserRecord> = {}): Omit<UserRecord, 'id'> => ({
  name: 'Docente Prueba',
  email: 'docente@sirai.test',
  passwordHash: 'hash:correcta',
  status: 'ACTIVO',
  failedAttempts: 0,
  lockedUntil: null,
  lastAccessAt: null,
  mustChangePassword: false,
  temporaryPasswordExpiresAt: null,
  defaultEstanciaId: 1,
  assignments: [{ role: 'DOCENTE', estanciaId: 1, estanciaName: 'Estancia 1' }],
  ...overrides,
});
