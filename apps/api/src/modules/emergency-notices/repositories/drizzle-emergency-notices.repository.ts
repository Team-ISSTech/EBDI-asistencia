import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import { DB } from '../../../common/database/database.module.js';
import type { DueNotice, NoticeOutcome } from '../emergency-notices.types.js';
import type { EmergencyNoticesRepository } from './emergency-notices.repository.js';

const { emergencyNotices, guardians } = schema;

@Injectable()
export class DrizzleEmergencyNoticesRepository implements EmergencyNoticesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async claimDue(now: Date, limit: number, leaseMs: number): Promise<DueNotice[]> {
    const isDue = and(eq(emergencyNotices.status, 'PENDIENTE'), isNull(emergencyNotices.deletedAt), or(isNull(emergencyNotices.nextAttemptAt), lte(emergencyNotices.nextAttemptAt, now)));
    const candidates = await this.db
      .select({
        id: emergencyNotices.id,
        followUpId: emergencyNotices.followUpId,
        guardianId: emergencyNotices.guardianId,
        attempts: emergencyNotices.attempts,
        phoneEncrypted: guardians.phoneEncrypted,
        guardianDeletedAt: guardians.deletedAt,
      })
      .from(emergencyNotices)
      .innerJoin(guardians, eq(guardians.id, emergencyNotices.guardianId))
      .where(isDue)
      .orderBy(asc(emergencyNotices.id))
      .limit(limit);
    const claimed: DueNotice[] = [];
    for (const { guardianDeletedAt, ...candidate } of candidates) {
      // La condición se repite en el UPDATE: si otra instancia ya lo reservó, no afecta ninguna fila.
      const [result] = await this.db
        .update(emergencyNotices)
        .set({ nextAttemptAt: new Date(now.getTime() + leaseMs), updatedAt: now })
        .where(and(eq(emergencyNotices.id, candidate.id), isDue));
      // Un tutor dado de baja ya no recibe avisos: se trata como sin teléfono.
      if (result.affectedRows === 1) claimed.push(guardianDeletedAt === null ? candidate : { ...candidate, phoneEncrypted: null });
    }
    return claimed;
  }

  async settle(noticeId: number, outcome: NoticeOutcome, now: Date, hook: (executor: AuditExecutor) => Promise<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(emergencyNotices)
        .set({
          status: outcome.status,
          attempts: outcome.attempts,
          nextAttemptAt: outcome.retryAt,
          sentAt: outcome.status === 'ENVIADO' ? now : null,
          externalMessageId: outcome.externalMessageId,
          errorCode: outcome.errorCode,
          updatedAt: now,
        })
        .where(eq(emergencyNotices.id, noticeId));
      await hook(tx);
    });
  }
}
