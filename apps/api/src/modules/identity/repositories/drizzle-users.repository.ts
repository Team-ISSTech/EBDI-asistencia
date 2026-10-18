import { Inject, Injectable } from '@nestjs/common';
import { isRoleCode } from '@sirai/auth';
import { USER_STATUSES, type UserStatus } from '@sirai/contracts';
import { schema, type Db } from '@sirai/db';
import { and, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { ApiError } from '../../../common/errors/api-error';
import type { AssignmentInput, AssignmentRecord, LockoutPolicy, NewUser, QueryScope, UserRecord } from '../identity.types';
import type { TransactionHook, UsersRepository } from './repositories';

const { usuarios, usuarioRol, roles, estancias, sesiones } = schema;
const MS_PER_MINUTE = 60_000;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';
const MISSING_REFERENCE = 'ER_NO_REFERENCED_ROW_2';

type UserRow = typeof usuarios.$inferSelect;
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const toStatus = (value: string): UserStatus =>
  (USER_STATUSES as readonly string[]).includes(value) ? (value as UserStatus) : 'INACTIVO';

const toRecord = (row: UserRow, assignments: readonly AssignmentRecord[]): UserRecord => ({
  id: row.id,
  name: row.name,
  email: row.email,
  passwordHash: row.passwordHash,
  status: toStatus(row.status),
  failedAttempts: row.failedAttempts,
  lockedUntil: row.lockedUntil,
  lastAccessAt: row.lastAccessAt,
  mustChangePassword: row.mustChangePassword,
  temporaryPasswordExpiresAt: row.temporaryPasswordExpiresAt,
  defaultEstanciaId: row.defaultEstanciaId,
  assignments,
});

/** Drizzle envuelve el error del driver en `cause`; se revisa en ambos niveles. */
const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

/** Traduce errores del motor a respuestas 4xx; el resto se propaga. */
const translateDriverError = (error: unknown): never => {
  const code = driverCode(error);
  if (code === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Ya existe un usuario con ese correo.');
  if (code === MISSING_REFERENCE) throw new ApiError('DATOS_INVALIDOS', 'Alguna estancia indicada no existe.');
  throw error;
};

const activeAssignmentFilter = (userId: number, now: Date) =>
  and(eq(usuarioRol.userId, userId), or(isNull(usuarioRol.validUntil), gt(usuarioRol.validUntil, now)));

@Injectable()
export class DrizzleUsersRepository implements UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.findOne(eq(usuarios.email, email));
  }

  findById(id: number): Promise<UserRecord | null> {
    return this.findOne(eq(usuarios.id, id));
  }

  async list(scope: QueryScope): Promise<UserRecord[]> {
    const rows = await this.db.select().from(usuarios).where(isNull(usuarios.deletedAt)).orderBy(usuarios.name);
    const assignments = await this.assignmentsOf(rows.map((row) => row.id), new Date());
    const records = rows.map((row) => toRecord(row, assignments.get(row.id) ?? []));
    if (scope.estanciaId === null) return records;
    return records.filter((user) => user.assignments.some((a) => a.estanciaId === scope.estanciaId));
  }

  /** Alta de usuario, asignaciones y auditoría en una sola transacción. */
  async createWithAssignments(
    user: NewUser,
    assignments: readonly AssignmentInput[],
    now: Date,
    inSameTransaction?: TransactionHook<number>,
  ): Promise<number> {
    const roleIds = await this.requireRoleIds(assignments);
    try {
      return await this.db.transaction(async (tx) => {
        const [result] = await tx.insert(usuarios).values({ ...user, createdAt: now, updatedAt: now });
        const userId = result.insertId;
        await this.insertAssignments(tx, userId, assignments, roleIds, now);
        await inSameTransaction?.(tx, userId);
        return userId;
      });
    } catch (error) {
      return translateDriverError(error);
    }
  }

  /** Cierra (vigente_hasta) lo que sobra e inserta lo nuevo, atómicamente. Nunca borra. */
  async replaceAssignments(
    userId: number,
    assignments: readonly AssignmentInput[],
    now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void> {
    const roleIds = await this.requireRoleIds(assignments);
    await this.db.transaction(async (tx) => {
      const current = await tx
        .select({ id: usuarioRol.id, roleId: usuarioRol.roleId, estanciaId: usuarioRol.estanciaId })
        .from(usuarioRol)
        .where(activeAssignmentFilter(userId, now));
      const wanted = assignments.map((a) => ({ roleId: roleIds.get(a.role), estanciaId: a.estanciaId }));
      const same = (a: { roleId: number | undefined; estanciaId: number | null }, b: { roleId: number; estanciaId: number | null }) =>
        a.roleId === b.roleId && a.estanciaId === b.estanciaId;
      const toClose = current.filter((row) => !wanted.some((w) => same(w, row)));
      const toInsert = assignments.filter((a) => !current.some((row) => same({ roleId: roleIds.get(a.role), estanciaId: a.estanciaId }, row)));
      if (toClose.length > 0) {
        await tx.update(usuarioRol).set({ validUntil: now }).where(inArray(usuarioRol.id, toClose.map((row) => row.id)));
      }
      await this.insertAssignments(tx, userId, toInsert, roleIds, now);
      await inSameTransaction?.(tx, undefined);
    }).catch(translateDriverError);
  }

  /**
   * Incremento atómico: una sola sentencia decide el bloqueo, así dos
   * peticiones simultáneas no pueden leer el mismo contador.
   */
  async registerFailedLogin(userId: number, policy: LockoutPolicy, now: Date): Promise<{ locked: boolean }> {
    const lockUntil = new Date(now.getTime() + policy.lockMinutes * MS_PER_MINUTE);
    await this.db
      .update(usuarios)
      .set({
        lockedUntil: sql`IF(${usuarios.failedAttempts} + 1 >= ${policy.maxAttempts}, ${lockUntil}, ${usuarios.lockedUntil})`,
        failedAttempts: sql`IF(${usuarios.failedAttempts} + 1 >= ${policy.maxAttempts}, 0, ${usuarios.failedAttempts} + 1)`,
        updatedAt: now,
      })
      .where(eq(usuarios.id, userId));
    const [row] = await this.db.select({ lockedUntil: usuarios.lockedUntil }).from(usuarios).where(eq(usuarios.id, userId));
    return { locked: row?.lockedUntil !== null && row?.lockedUntil !== undefined && row.lockedUntil > now };
  }

  async changePassword(userId: number, passwordHash: string, now: Date, keepSessionId: number | null, inSameTransaction?: TransactionHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(usuarios)
        .set({ passwordHash, mustChangePassword: false, temporaryPasswordExpiresAt: null, passwordChangedAt: now, failedAttempts: 0, lockedUntil: null, updatedAt: now })
        .where(eq(usuarios.id, userId));
      await this.revokeSessions(tx, userId, now, keepSessionId);
      await inSameTransaction?.(tx, undefined);
    });
  }

  async setTemporaryPassword(userId: number, passwordHash: string, expiresAt: Date, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(usuarios)
        .set({ passwordHash, mustChangePassword: true, temporaryPasswordExpiresAt: expiresAt, failedAttempts: 0, lockedUntil: null, updatedAt: now })
        .where(eq(usuarios.id, userId));
      await this.revokeSessions(tx, userId, now, null);
      await inSameTransaction?.(tx, undefined);
    });
  }

  /** Cierra las sesiones vigentes del usuario; una contraseña nueva no debe dejar abiertas las que ya no la conocen. */
  private async revokeSessions(executor: Executor, userId: number, now: Date, keepSessionId: number | null): Promise<void> {
    const keep = keepSessionId === null ? undefined : ne(sesiones.id, keepSessionId);
    await executor.update(sesiones).set({ revokedAt: now }).where(and(eq(sesiones.userId, userId), isNull(sesiones.revokedAt), keep));
  }

  async registerSuccessfulLogin(userId: number, now: Date, executor: Executor = this.db): Promise<void> {
    await executor
      .update(usuarios)
      .set({ failedAttempts: 0, lockedUntil: null, lastAccessAt: now, updatedAt: now })
      .where(eq(usuarios.id, userId));
  }

  private async findOne(condition: ReturnType<typeof eq>): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(usuarios).where(and(condition, isNull(usuarios.deletedAt)));
    if (!row) return null;
    const assignments = await this.assignmentsOf([row.id], new Date());
    return toRecord(row, assignments.get(row.id) ?? []);
  }

  /** Valida los roles antes de escribir, para no dejar estado a medias. */
  private async requireRoleIds(assignments: readonly AssignmentInput[]): Promise<Map<string, number>> {
    const rows = await this.db.select({ id: roles.id, code: roles.code }).from(roles);
    const ids = new Map(rows.map((row) => [row.code, row.id]));
    const missing = assignments.find((a) => !ids.has(a.role));
    if (missing) throw new ApiError('DATOS_INVALIDOS', `El rol ${missing.role} no existe en el catálogo.`);
    return ids;
  }

  private async insertAssignments(
    executor: Executor,
    userId: number,
    assignments: readonly AssignmentInput[],
    roleIds: ReadonlyMap<string, number>,
    now: Date,
  ): Promise<void> {
    const values = assignments.map((a) => ({ userId, roleId: roleIds.get(a.role) ?? 0, estanciaId: a.estanciaId, validFrom: now }));
    if (values.length > 0) await executor.insert(usuarioRol).values(values);
  }

  /** Asignaciones vigentes de varios usuarios en una sola consulta. */
  private async assignmentsOf(userIds: readonly number[], now: Date): Promise<Map<number, AssignmentRecord[]>> {
    const result = new Map<number, AssignmentRecord[]>();
    if (userIds.length === 0) return result;
    const rows = await this.db
      .select({
        userId: usuarioRol.userId,
        role: roles.code,
        estanciaId: usuarioRol.estanciaId,
        region: usuarioRol.region,
        estanciaName: sql<string | null>`${estancias.name}`,
      })
      .from(usuarioRol)
      .innerJoin(roles, eq(roles.id, usuarioRol.roleId))
      .leftJoin(estancias, eq(estancias.id, usuarioRol.estanciaId))
      .where(and(inArray(usuarioRol.userId, [...userIds]), or(isNull(usuarioRol.validUntil), gt(usuarioRol.validUntil, now))));
    for (const row of rows) {
      if (!isRoleCode(row.role)) continue;
      const list = result.get(row.userId) ?? [];
      result.set(row.userId, [...list, { role: row.role, estanciaId: row.estanciaId, estanciaName: row.estanciaName, region: row.region }]);
    }
    return result;
  }
}
