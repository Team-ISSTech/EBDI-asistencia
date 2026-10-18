import { Inject, Injectable } from '@nestjs/common';
import { type IntegrationScope, isIntegrationScope } from '@sirai/auth';
import { schema, type Db } from '@sirai/db';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { NewSystem, SystemRecord, SystemStatus } from '../integration.types';
import type { SystemsRepository } from './systems.repository';

const { integrationSystems } = schema;

type SystemRow = typeof integrationSystems.$inferSelect;

const toScopes = (stored: string): IntegrationScope[] => stored.split(',').filter(isIntegrationScope);
const toStatus = (value: string): SystemStatus => (value === 'ACTIVO' ? 'ACTIVO' : 'REVOCADO');

const toRecord = (row: SystemRow): SystemRecord => ({
  id: row.id,
  name: row.name,
  clientId: row.clientId,
  secretHash: row.secretHash,
  scopes: toScopes(row.scopes),
  status: toStatus(row.status),
  lastUsedAt: row.lastUsedAt,
  createdAt: row.createdAt,
  revokedAt: row.revokedAt,
});

@Injectable()
export class DrizzleSystemsRepository implements SystemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  create(system: NewSystem, now: Date, inSameTransaction?: TransactionHook<number>): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(integrationSystems).values({
        name: system.name,
        clientId: system.clientId,
        secretHash: system.secretHash,
        scopes: system.scopes.join(','),
        createdBy: system.createdBy,
        createdAt: now,
        updatedAt: now,
      });
      await inSameTransaction?.(tx, created.insertId);
      return created.insertId;
    });
  }

  async list(): Promise<SystemRecord[]> {
    const rows = await this.db.select().from(integrationSystems).orderBy(asc(integrationSystems.name), asc(integrationSystems.id));
    return rows.map(toRecord);
  }

  async findById(id: number): Promise<SystemRecord | null> {
    const [row] = await this.db.select().from(integrationSystems).where(eq(integrationSystems.id, id));
    return row ? toRecord(row) : null;
  }

  async findByClientId(clientId: string): Promise<SystemRecord | null> {
    const [row] = await this.db.select().from(integrationSystems).where(eq(integrationSystems.clientId, clientId));
    return row ? toRecord(row) : null;
  }

  async revoke(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(integrationSystems).set({ status: 'REVOCADO', revokedAt: now, revokedBy: userId, updatedAt: now }).where(eq(integrationSystems.id, id));
      await inSameTransaction?.(tx, undefined);
    });
  }

  async touchLastUsed(id: number, now: Date): Promise<void> {
    await this.db.update(integrationSystems).set({ lastUsedAt: now }).where(eq(integrationSystems.id, id));
  }
}
