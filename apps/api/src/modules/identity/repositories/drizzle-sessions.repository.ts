import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import type { NewSession, SessionRecord } from '../identity.types';
import type { SessionsRepository, TransactionHook } from './repositories';

const { sesiones } = schema;

@Injectable()
export class DrizzleSessionsRepository implements SessionsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  create(session: NewSession, inSameTransaction?: TransactionHook<number>): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [result] = await tx.insert(sesiones).values({ ...session, lastUsedAt: session.createdAt });
      await inSameTransaction?.(tx, result.insertId);
      return result.insertId;
    });
  }

  async findActiveByTokenHash(tokenHash: Buffer, now: Date): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select({
        id: sesiones.id,
        userId: sesiones.userId,
        activeEstanciaId: sesiones.activeEstanciaId,
        expiresAt: sesiones.expiresAt,
        createdAt: sesiones.createdAt,
        lastUsedAt: sesiones.lastUsedAt,
      })
      .from(sesiones)
      .where(and(eq(sesiones.tokenHash, tokenHash), isNull(sesiones.revokedAt), gt(sesiones.expiresAt, now)));
    return row ?? null;
  }

  async touch(id: number, lastUsedAt: Date, expiresAt: Date): Promise<void> {
    await this.db.update(sesiones).set({ lastUsedAt, expiresAt }).where(eq(sesiones.id, id));
  }

  revoke(id: number, at: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.update(sesiones).set({ revokedAt: at }).where(eq(sesiones.id, id));
      await inSameTransaction?.(tx, undefined);
    });
  }

  setActiveEstancia(id: number, estanciaId: number, inSameTransaction?: TransactionHook<void>): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.update(sesiones).set({ activeEstanciaId: estanciaId }).where(eq(sesiones.id, id));
      await inSameTransaction?.(tx, undefined);
    });
  }
}
