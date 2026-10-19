import type { AuditEntry } from '../../../common/audit/audit.service.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import type { MessageChannel, SendResult } from '../channels/message-channel.js';
import type { DueNotice, NoticeOutcome } from '../emergency-notices.types.js';
import type { EmergencyNoticesRepository } from '../repositories/emergency-notices.repository.js';

export const encryption = new EncryptionService({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) } as never);
export const NOW = new Date('2026-10-15T16:00:00Z');

export class FakeNotices implements EmergencyNoticesRepository {
  due: DueNotice[] = [];
  settled = new Map<number, NoticeOutcome>();
  claims: Array<{ limit: number; leaseMs: number }> = [];

  claimDue(_now: Date, limit: number, leaseMs: number): Promise<DueNotice[]> {
    this.claims.push({ limit, leaseMs });
    return Promise.resolve(this.due.slice(0, limit));
  }
  async settle(noticeId: number, outcome: NoticeOutcome, _now: Date, hook: (executor: never) => Promise<void>): Promise<void> {
    this.settled.set(noticeId, outcome);
    await hook({} as never);
  }
}

export class FakeChannel implements MessageChannel {
  enabled = true;
  sent: string[] = [];
  next: SendResult = { ok: true, messageId: 'wamid.1' };
  send(phone: string): Promise<SendResult> {
    this.sent.push(phone);
    return Promise.resolve(this.next);
  }
}

export class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export const notice = (overrides: Partial<DueNotice> = {}): DueNotice => ({
  id: 1,
  followUpId: 4,
  guardianId: 11,
  attempts: 0,
  phoneEncrypted: encryption.encrypt('5512345678'),
  ...overrides,
});
