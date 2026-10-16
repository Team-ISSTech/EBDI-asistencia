import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service.js';
import type { AbsenceCandidate } from '../follow-ups.types.js';
import type { FollowUpsRepository, TicketHook } from '../repositories/follow-ups.repository.js';
import { FollowUpsGeneratorService } from '../services/follow-ups-generator.service.js';

const candidate = (overrides: Partial<AbsenceCandidate> = {}): AbsenceCandidate => ({
  recordId: 1,
  estanciaId: 7,
  journeyDate: '2026-10-15',
  timeZone: 'America/Mexico_City',
  ...overrides,
});

class FakeRepo {
  pending: AbsenceCandidate[] = [];
  tickets = new Map<number, number>();
  sinceDates: string[] = [];
  private nextId = 1;

  findAbsencesWithoutTicket(sinceDate: string): Promise<AbsenceCandidate[]> {
    this.sinceDates.push(sinceDate);
    return Promise.resolve(this.pending.filter((c) => !this.tickets.has(c.recordId)));
  }

  async openTickets(candidates: readonly AbsenceCandidate[], _now: Date, hook: TicketHook): Promise<number> {
    let created = 0;
    for (const c of candidates) {
      if (this.tickets.has(c.recordId)) continue;
      const id = this.nextId++;
      this.tickets.set(c.recordId, id);
      await hook({} as Parameters<TicketHook>[0], c, id);
      created += 1;
    }
    return created;
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

describe('FollowUpsGeneratorService', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: FollowUpsGeneratorService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    service = new FollowUpsGeneratorService(repo as unknown as FollowUpsRepository, audit as unknown as AuditService);
  });

  it('antes de las 09:00 de la estancia no genera tickets', async () => {
    repo.pending = [candidate()];
    expect(await service.generateDue(new Date('2026-10-15T14:59:00Z'))).toBe(0);
    expect(repo.tickets.size).toBe(0);
  });

  it('desde las 09:00 de la estancia genera un ticket por ausencia y lo audita como el sistema', async () => {
    repo.pending = [candidate({ recordId: 1 }), candidate({ recordId: 2 })];
    expect(await service.generateDue(new Date('2026-10-15T15:00:00Z'))).toBe(2);
    expect(audit.entries).toHaveLength(2);
    expect(audit.entries[0]).toMatchObject({ action: 'SEGUIMIENTO_ABIERTO', userId: null, roleCode: 'SISTEMA', tableName: 'seguimientos' });
    expect(audit.entries[0]?.request).toEqual({ ip: null, userAgent: 'job:seguimientos', requestId: null });
  });

  it('respeta la zona horaria de cada estancia', async () => {
    repo.pending = [candidate({ recordId: 1, timeZone: 'America/Mexico_City' }), candidate({ recordId: 2, timeZone: 'America/Tijuana' })];
    expect(await service.generateDue(new Date('2026-10-15T15:00:00Z'))).toBe(1);
    expect([...repo.tickets.keys()]).toEqual([1]);
    expect(await service.generateDue(new Date('2026-10-15T16:00:00Z'))).toBe(1);
    expect([...repo.tickets.keys()].sort()).toEqual([1, 2]);
  });

  it('es repetible: correr de nuevo no duplica ni audita otra vez', async () => {
    repo.pending = [candidate()];
    await service.generateDue(new Date('2026-10-15T15:00:00Z'));
    audit.entries.length = 0;
    expect(await service.generateDue(new Date('2026-10-15T15:01:00Z'))).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('una jornada de un día anterior ya venció y genera su ticket', async () => {
    repo.pending = [candidate({ journeyDate: '2026-10-14' })];
    expect(await service.generateDue(new Date('2026-10-15T07:00:00Z'))).toBe(1);
  });

  it('solo revisa los últimos días, no toda la tabla', async () => {
    await service.generateDue(new Date('2026-10-15T15:00:00Z'));
    expect(repo.sinceDates).toEqual(['2026-10-08']);
  });
});
