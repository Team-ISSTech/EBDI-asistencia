import { expect } from 'vitest';
import type { Principal } from '@sirai/auth';
import type { AuditEntry } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { ContactRow, FollowUpDetail, FollowUpRow, NewContact, NewRelease, TicketChange } from '../follow-ups.types.js';
import type { FollowUpsRepository } from '../repositories/follow-ups.repository.js';

export const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
export const socialWork: Principal = { userId: 8, assignments: [{ role: 'TRABAJO_SOCIAL', estanciaId: 7 }] };
export const auth: AuthContext = { sessionId: 1, userId: 8, principal: socialWork, activeEstanciaId: 7 };
export const doctorAuth: AuthContext = { sessionId: 2, userId: 9, principal: { userId: 9, assignments: [{ role: 'MEDICO', estanciaId: 7 }] }, activeEstanciaId: 7 };
export const encryption = new EncryptionService({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) } as never);
/** Coincide con un mensaje que contenga el texto, sin propagar `any` a las aserciones. */
export const containing = (text: string): string => expect.stringContaining(text) as string;

export const NOW = new Date('2026-10-15T16:00:00Z');

export interface StoredTicket extends FollowUpDetail {
  estanciaId: number;
  expectedReturnDate: string | null;
}

export class FakeRepo implements FollowUpsRepository {
  tickets = new Map<number, StoredTicket>();
  contacts = new Map<number, Array<ContactRow & NewContact & { followUpId: number }>>();
  linked = new Map<string, Buffer | null>();
  emergencyGuardians: number[] = [];
  releases = new Map<number, NewRelease>();
  closedAt = new Map<number, Date>();
  nextId = 1;

  findAbsencesWithoutTicket(): Promise<never[]> {
    return Promise.resolve([]);
  }
  openTickets(): Promise<number> {
    return Promise.resolve(0);
  }
  listOpen(): Promise<FollowUpRow[]> {
    return Promise.resolve([]);
  }
  findOne(id: number, estanciaId: number): Promise<FollowUpRow | null> {
    const t = this.tickets.get(id);
    if (t?.estanciaId !== estanciaId) return Promise.resolve(null);
    const last = (this.contacts.get(id) ?? []).at(-1);
    return Promise.resolve({
      id: t.id, childId: t.childId, childName: 'Infante Prueba', enrollmentNumber: 'M-1', roomName: 'Sala', absenceDate: '2026-10-15', absenceStatus: 'FALTA_INJUSTIFICADA',
      status: t.status, cause: t.cause, expectedReturnDate: t.expectedReturnDate, requiresMedicalRelease: t.requiresMedicalRelease, medicalReleased: t.released,
      attemptCount: t.attemptCount, failedAttempts: t.failedAttempts, nextAttemptAt: last?.nextAttemptAt ?? null, openedAt: NOW,
    });
  }
  findDetail(id: number, estanciaId: number): Promise<FollowUpDetail | null> {
    const t = this.tickets.get(id);
    return Promise.resolve(t?.estanciaId === estanciaId ? t : null);
  }
  findContactOperation(operationId: string): Promise<number | null> {
    for (const [followUpId, list] of this.contacts) if (list.some((contact) => contact.operationId === operationId)) return Promise.resolve(followUpId);
    return Promise.resolve(null);
  }
  findGuardianPhone(childId: number, guardianId: number): Promise<{ phoneEncrypted: Buffer | null } | null> {
    const key = `${childId}:${guardianId}`;
    return Promise.resolve(this.linked.has(key) ? { phoneEncrypted: this.linked.get(key) ?? null } : null);
  }
  findEmergencyGuardianIds(): Promise<number[]> {
    return Promise.resolve(this.emergencyGuardians);
  }
  async registerContact(
    followUpId: number,
    contact: NewContact,
    change: TicketChange,
    context: { userId: number; now: Date },
    hook: (executor: never, contactId: number) => Promise<void>,
  ): Promise<number> {
    const ticket = this.tickets.get(followUpId) as StoredTicket;
    const id = this.nextId++;
    const list = this.contacts.get(followUpId) ?? [];
    list.push({ ...contact, id, followUpId, occurredAt: context.now });
    this.contacts.set(followUpId, list);
    this.tickets.set(followUpId, {
      ...ticket,
      ...change,
      attemptCount: ticket.attemptCount + 1,
      failedAttempts: ticket.failedAttempts + (contact.result === 'SIN_RESPUESTA' ? 1 : 0),
    });
    await hook({} as never, id);
    return id;
  }
  async registerRelease(
    followUpId: number,
    release: NewRelease,
    _context: { userId: number; now: Date },
    hook: (executor: never) => Promise<void>,
  ): Promise<void> {
    this.releases.set(followUpId, release);
    const ticket = this.tickets.get(followUpId) as StoredTicket;
    this.tickets.set(followUpId, { ...ticket, released: true });
    await hook({} as never);
  }
  async closeTicket(followUpId: number, closedAt: Date, hook: (executor: never) => Promise<void>): Promise<void> {
    const ticket = this.tickets.get(followUpId) as StoredTicket;
    this.tickets.set(followUpId, { ...ticket, status: 'CERRADO' });
    this.closedAt.set(followUpId, closedAt);
    await hook({} as never);
  }
  listContacts(followUpId: number): Promise<ContactRow[]> {
    return Promise.resolve(this.contacts.get(followUpId) ?? []);
  }
}

export class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export const ticket = (overrides: Partial<StoredTicket> = {}): StoredTicket => ({
  id: 1, estanciaId: 7, childId: 5, status: 'ABIERTO', cause: null, requiresMedicalRelease: false, expectedReturnDate: null, attemptCount: 0, failedAttempts: 0, released: false, ...overrides,
});

