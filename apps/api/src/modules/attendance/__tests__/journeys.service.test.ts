import type { Principal } from '@sirai/auth';
import { describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { AttendanceJourneyRecord } from '../attendance.types.js';
import type { AttendanceJourneysRepository, JourneyTransactionHook } from '../repositories/repositories.js';
import { JourneysService } from '../services/journeys.service.js';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const principal: Principal = { userId: 5, assignments: [{ role: 'DOCENTE', estanciaId: 7 }] };
const auth: AuthContext = { sessionId: 3, userId: 5, principal, activeEstanciaId: 7 };

class InMemoryJourneys implements AttendanceJourneysRepository {
  readonly rows = new Map<number, AttendanceJourneyRecord>();
  private nextId = 1;

  findById(id: number, estanciaId: number): Promise<AttendanceJourneyRecord | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row?.estanciaId === estanciaId ? row : null);
  }

  findByKey(estanciaId: number, date: string, shift: AttendanceJourneyRecord['shift']): Promise<AttendanceJourneyRecord | null> {
    return Promise.resolve([...this.rows.values()].find((row) => row.estanciaId === estanciaId && row.date === date && row.shift === shift) ?? null);
  }

  async create(input: Omit<AttendanceJourneyRecord, 'id' | 'status' | 'closedAt' | 'closedBy'>, hook?: JourneyTransactionHook<number>): Promise<AttendanceJourneyRecord> {
    if (await this.findByKey(input.estanciaId, input.date, input.shift)) throw new ApiError('CONFLICTO', 'Ya existe una jornada.');
    const row: AttendanceJourneyRecord = { ...input, id: this.nextId++, status: 'ABIERTA', closedAt: null, closedBy: null };
    this.rows.set(row.id, row);
    await hook?.({} as Parameters<JourneyTransactionHook<number>>[0], row.id);
    return row;
  }

  async close(id: number, estanciaId: number, closedBy: number, closedAt: Date, hook?: JourneyTransactionHook<void>): Promise<AttendanceJourneyRecord | null> {
    const row = await this.findById(id, estanciaId);
    if (!row || row.status === 'CERRADA') return row;
    const closed = { ...row, status: 'CERRADA' as const, closedBy, closedAt };
    this.rows.set(id, closed);
    await hook?.({} as Parameters<JourneyTransactionHook<void>>[0], undefined);
    return closed;
  }
}

class RecordingAudit {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

const setup = () => {
  const repository = new InMemoryJourneys();
  const audit = new RecordingAudit();
  return { audit, service: new JourneysService(repository, audit as unknown as AuditService) };
};

describe('JourneysService', () => {
  it('abre una jornada en la estancia activa y la audita', async () => {
    const { service, audit } = setup();
    await expect(service.open(auth, { date: '2026-10-15', shift: 'MATUTINO' }, request)).resolves.toMatchObject({ id: 1, estanciaId: 7, status: 'ABIERTA' });
    expect(audit.entries[0]).toMatchObject({ action: 'JORNADA_ABIERTA', recordId: '1' });
  });

  it('rechaza abrir sin estancia activa o duplicar la combinación', async () => {
    const { service } = setup();
    await expect(service.open({ ...auth, activeEstanciaId: null }, { date: '2026-10-15', shift: 'MATUTINO' }, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    await service.open(auth, { date: '2026-10-15', shift: 'MATUTINO' }, request);
    await expect(service.open(auth, { date: '2026-10-15', shift: 'MATUTINO' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('cierra una jornada abierta una sola vez', async () => {
    const { service } = setup();
    const opened = await service.open(auth, { date: '2026-10-15', shift: 'MATUTINO' }, request);
    await expect(service.close(auth, opened.id, request)).resolves.toMatchObject({ status: 'CERRADA' });
    await expect(service.close(auth, opened.id, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('consulta la jornada únicamente en la estancia activa', async () => {
    const { service } = setup();
    await service.open(auth, { date: '2026-10-15', shift: 'MATUTINO' }, request);
    await expect(service.find(auth, { date: '2026-10-15', shift: 'MATUTINO' })).resolves.toMatchObject({ estanciaId: 7 });
    await expect(service.find({ ...auth, activeEstanciaId: 8 }, { date: '2026-10-15', shift: 'MATUTINO' })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await service.close(auth, 1, request);
    await expect(service.find(auth, { date: '2026-10-15', shift: 'MATUTINO' })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});
