import { Inject, Injectable } from '@nestjs/common';
import { CONSENT_TYPES, type ConsentType } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { ConsentRecord, NewConsent } from '../children.types';
import type { ConsentsRepository } from './consents.repository';

const { consents } = schema;

type ConsentRow = typeof consents.$inferSelect;

const toType = (value: string): ConsentType => (CONSENT_TYPES as readonly string[]).includes(value) ? (value as ConsentType) : CONSENT_TYPES[0];

const toRecord = (row: ConsentRow): ConsentRecord => ({
  id: row.id,
  childId: row.childId,
  guardianId: row.guardianId,
  type: toType(row.type),
  noticeVersion: row.noticeVersion,
  accepted: row.accepted,
  acceptedAt: row.acceptedAt,
  revokedAt: row.revokedAt,
  registeredBy: row.registeredBy,
});

@Injectable()
export class DrizzleConsentsRepository implements ConsentsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listForChild(childId: number): Promise<ConsentRecord[]> {
    const rows = await this.db.select().from(consents).where(eq(consents.childId, childId)).orderBy(desc(consents.acceptedAt), desc(consents.id));
    return rows.map(toRecord);
  }

  async findById(id: number): Promise<ConsentRecord | null> {
    const [row] = await this.db.select().from(consents).where(eq(consents.id, id));
    return row ? toRecord(row) : null;
  }

  create(consent: NewConsent, now: Date, userId: number, inSameTransaction?: TransactionHook<number>): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(consents).values({
        childId: consent.childId,
        guardianId: consent.guardianId,
        type: consent.type,
        noticeVersion: consent.noticeVersion,
        accepted: consent.accepted,
        acceptedAt: now,
        registeredBy: userId,
        createdAt: now,
      });
      await inSameTransaction?.(tx, created.insertId);
      return created.insertId;
    });
  }

  async revoke(id: number, at: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(consents).set({ revokedAt: at }).where(eq(consents.id, id));
      await inSameTransaction?.(tx, undefined);
    });
  }
}
