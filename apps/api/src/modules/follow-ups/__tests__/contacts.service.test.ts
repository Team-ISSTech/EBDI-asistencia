import type { Principal } from '@sirai/auth';
import type { RegisterContactRequest } from '@sirai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { ContactRow, FollowUpDetail, FollowUpRow, NewContact, TicketChange } from '../follow-ups.types.js';
import type { FollowUpsRepository } from '../repositories/follow-ups.repository.js';
import { FollowUpsService } from '../services/follow-ups.service.js';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const principal: Principal = { userId: 8, assignments: [{ role: 'TRABAJO_SOCIAL', estanciaId: 7 }] };
const auth: AuthContext = { sessionId: 1, userId: 8, principal, activeEstanciaId: 7 };
const encryption = new EncryptionService({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) } as never);
const NOW = new Date('2026-10-15T16:00:00Z');

interface StoredTicket extends FollowUpDetail {
  estanciaId: number;
  expectedReturnDate: string | null;
}

class FakeRepo implements FollowUpsRepository {
  tickets = new Map<number, StoredTicket>();
  contacts = new Map<number, Array<ContactRow & NewContact & { followUpId: number }>>();
  linked = new Map<string, Buffer | null>();
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
      status: t.status, cause: t.cause, expectedReturnDate: t.expectedReturnDate, requiresMedicalRelease: t.requiresMedicalRelease,
      attemptCount: t.attemptCount, failedAttempts: t.failedAttempts, nextAttemptAt: last?.nextAttemptAt ?? null, openedAt: NOW,
    });
  }
  findDetail(id: number, estanciaId: number): Promise<FollowUpDetail | null> {
    const t = this.tickets.get(id);
    return Promise.resolve(t?.estanciaId === estanciaId ? t : null);
  }
  findGuardianPhone(childId: number, guardianId: number): Promise<{ phoneEncrypted: Buffer | null } | null> {
    const key = `${childId}:${guardianId}`;
    return Promise.resolve(this.linked.has(key) ? { phoneEncrypted: this.linked.get(key) ?? null } : null);
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
  listContacts(followUpId: number): Promise<ContactRow[]> {
    return Promise.resolve(this.contacts.get(followUpId) ?? []);
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

const ticket = (overrides: Partial<StoredTicket> = {}): StoredTicket => ({
  id: 1, estanciaId: 7, childId: 5, status: 'ABIERTO', cause: null, requiresMedicalRelease: false, expectedReturnDate: null, attemptCount: 0, failedAttempts: 0, ...overrides,
});

const reached: RegisterContactRequest = { result: 'CONTACTADO', guardianId: 3, cause: 'ENF_CASA', expectedReturnDate: '2026-10-20', notes: 'Fiebre desde ayer; irá a su clínica.' };

describe('FollowUpsService: contactos', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: FollowUpsService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    repo.tickets.set(1, ticket());
    repo.linked.set('5:3', encryption.encrypt('5512345678'));
    service = new FollowUpsService(repo, audit as unknown as AuditService, encryption, () => NOW);
  });

  it('contactar al tutor clasifica el ticket, activa el candado médico y audita antes y después', async () => {
    const result = await service.registerContact(auth, 1, reached, request);
    expect(result).toMatchObject({ status: 'CLASIFICADO', cause: 'ENF_CASA', requiresMedicalRelease: true, expectedReturnDate: '2026-10-20', attemptCount: 1, emergencyAlert: false });
    expect(audit.entries[0]).toMatchObject({ action: 'CONTACTO_REGISTRADO', roleCode: 'TRABAJO_SOCIAL', tableName: 'seguimientos', recordId: '1' });
    expect(audit.entries[0]?.before).toMatchObject({ status: 'ABIERTO', cause: null });
    expect(audit.entries[0]?.after).toMatchObject({ status: 'CLASIFICADO', cause: 'ENF_CASA', attemptNumber: 1, result: 'CONTACTADO' });
  });

  it('cifra las notas y el teléfono marcado, y no los pone en la bitácora', async () => {
    await service.registerContact(auth, 1, reached, request);
    const stored = repo.contacts.get(1)?.[0];
    expect(stored?.notesEncrypted?.toString('utf8')).not.toContain('Fiebre');
    expect(encryption.decrypt(stored?.notesEncrypted as Buffer)).toBe(reached.notes);
    expect(encryption.decrypt(stored?.phoneEncrypted as Buffer)).toBe('5512345678');
    expect(JSON.stringify(audit.entries)).not.toMatch(/Fiebre|5512345678/);
  });

  it('no localizar al tutor clasifica NO_LOC y programa el segundo intento a las 4 horas', async () => {
    const result = await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA', guardianId: 3 }, request);
    expect(result).toMatchObject({ status: 'CLASIFICADO', cause: 'NO_LOC', attemptCount: 1, emergencyAlert: false, nextAttemptAt: '2026-10-15T20:00:00.000Z' });
  });

  it('el segundo intento sin respuesta activa la alerta a los contactos de emergencia', async () => {
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    const second = await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(second).toMatchObject({ cause: 'NO_LOC', attemptCount: 2, emergencyAlert: true, nextAttemptAt: null });
  });

  it('un intento sin respuesta no exige tutor y no copia ningún teléfono', async () => {
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(repo.contacts.get(1)?.[0]).toMatchObject({ guardianId: null, phoneEncrypted: null, notesEncrypted: null });
  });

  it('rechaza a un tutor que no está vinculado al infante', async () => {
    await expect(service.registerContact(auth, 1, { ...reached, guardianId: 99 }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
    expect(audit.entries).toHaveLength(0);
    expect(repo.contacts.size).toBe(0);
  });

  it('un ticket de otra estancia no existe', async () => {
    await expect(service.registerContact({ ...auth, activeEstanciaId: 99 }, 1, reached, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(service.listContacts({ ...auth, activeEstanciaId: 99 }, 1, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('no se registran intentos en un ticket cerrado', async () => {
    repo.tickets.set(1, ticket({ status: 'CERRADO' }));
    await expect(service.registerContact(auth, 1, reached, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('exige una estancia activa', async () => {
    await expect(service.registerContact({ ...auth, activeEstanciaId: null }, 1, reached, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });

  it('el historial devuelve las notas descifradas y la lectura se audita', async () => {
    await service.registerContact(auth, 1, reached, request);
    audit.entries.length = 0;
    const contacts = await service.listContacts(auth, 1, request);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ attemptNumber: 1, result: 'CONTACTADO', guardianId: 3, notes: reached.notes, nextAttemptAt: null });
    expect(audit.entries[0]).toMatchObject({ action: 'NOTAS_SEGUIMIENTO_CONSULTADAS', recordId: '1' });
  });
});
