import { Inject, Injectable } from '@nestjs/common';
import { ESTANCIA_STATUSES, type EstanciaStatus, type EstanciaUsage } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { ApiError } from '../../../common/errors/api-error';
import type { EstanciaChanges, EstanciaRecord, NewEstancia } from '../administration.types';
import type { AdminHook, EstanciasAdminRepository } from './estancias-admin.repository';

const { estancias, enrollments, jornadasAsistencia } = schema;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

const toStatus = (value: string): EstanciaStatus => ((ESTANCIA_STATUSES as readonly string[]).includes(value) ? (value as EstanciaStatus) : 'INACTIVA');

const columns = {
  id: estancias.id,
  code: estancias.ebdiCode,
  name: estancias.name,
  ur: estancias.ur,
  region: estancias.region,
  address: estancias.address,
  timeZone: estancias.timeZone,
  status: estancias.status,
};

@Injectable()
export class DrizzleEstanciasAdminRepository implements EstanciasAdminRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<EstanciaRecord[]> {
    const rows = await this.db.select(columns).from(estancias).where(isNull(estancias.deletedAt)).orderBy(asc(estancias.name));
    return rows.map((row) => ({ ...row, status: toStatus(row.status) }));
  }

  async findById(id: number): Promise<EstanciaRecord | null> {
    const [row] = await this.db.select(columns).from(estancias).where(and(eq(estancias.id, id), isNull(estancias.deletedAt)));
    return row ? { ...row, status: toStatus(row.status) } : null;
  }

  async create(input: NewEstancia, now: Date, hook: AdminHook<number>): Promise<number> {
    try {
      return await this.db.transaction(async (tx) => {
        const [created] = await tx.insert(estancias).values({
          ebdiCode: input.code,
          name: input.name,
          ur: input.ur,
          region: input.region,
          address: input.address,
          timeZone: input.timeZone,
          createdAt: now,
          updatedAt: now,
        });
        await hook(tx, created.insertId);
        return created.insertId;
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Ya existe una estancia con esa clave EBDI.');
      throw error;
    }
  }

  async update(id: number, changes: EstanciaChanges, now: Date, hook: AdminHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(estancias).set({ ...changes, updatedAt: now }).where(eq(estancias.id, id));
      await hook(tx, undefined);
    });
  }

  async retire(id: number, userId: number, now: Date, hook: AdminHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(estancias).set({ status: 'INACTIVA', deletedAt: now, deletedBy: userId, updatedAt: now }).where(eq(estancias.id, id));
      await hook(tx, undefined);
    });
  }

  async usage(id: number): Promise<EstanciaUsage> {
    const [enrolled] = await this.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(enrollments)
      .where(and(eq(enrollments.estanciaId, id), eq(enrollments.status, 'ACTIVA'), isNull(enrollments.deletedAt)));
    const [open] = await this.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(jornadasAsistencia)
      .where(and(eq(jornadasAsistencia.estanciaId, id), eq(jornadasAsistencia.status, 'ABIERTA')));
    return { activeEnrollments: Number(enrolled?.total ?? 0), openJourneys: Number(open?.total ?? 0) };
  }
}
