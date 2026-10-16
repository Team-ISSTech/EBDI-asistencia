import type { Principal } from '@sirai/auth';
import type { MarkAttendanceRequest } from '@sirai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { AttendanceJourneyRecord } from '../attendance.types.js';
import type { AttendanceRecordsRepository, MarkChangeHook } from '../repositories/records.repository.js';
import type { AttendanceJourneysRepository } from '../repositories/repositories.js';
import type { EnrollmentForMarking, ExistingMark, MarkChange, RosterRow } from '../records.types.js';
import { AttendanceRecordsService } from '../services/records.service.js';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const principal: Principal = { userId: 5, assignments: [{ role: 'DOCENTE', estanciaId: 7 }] };
const auth: AuthContext = { sessionId: 3, userId: 5, principal, activeEstanciaId: 7 };
/** Coincide con un mensaje que contenga el texto, sin propagar `any` a las aserciones. */
const containing = (text: string): string => expect.stringContaining(text) as string;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const journey = (overrides: Partial<AttendanceJourneyRecord> = {}): AttendanceJourneyRecord => ({
  id: 1,
  estanciaId: 7,
  date: '2026-10-15',
  shift: 'MATUTINO',
  status: 'ABIERTA',
  openedAt: new Date('2026-10-15T13:00:00Z'),
  openedBy: 5,
  closedAt: null,
  closedBy: null,
  ...overrides,
});

class FakeJourneys {
  rows = new Map<number, AttendanceJourneyRecord>([[1, journey()]]);
  findById(id: number, estanciaId: number): Promise<AttendanceJourneyRecord | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row?.estanciaId === estanciaId ? row : null);
  }
}

class FakeRecords implements AttendanceRecordsRepository {
  enrollments = new Map<number, EnrollmentForMarking & { estanciaId: number; childName: string }>();
  marks = new Map<number, { id: number; status: ExistingMark['status']; clientId: string }>();
  locked = new Set<number>();
  appliedBatches: MarkChange[][] = [];
  appliedAt: Date[] = [];
  private nextId = 1;

  listRoster(estanciaId: number, _journeyId: number, shift: 'MATUTINO' | 'VESPERTINO'): Promise<RosterRow[]> {
    return Promise.resolve(
      [...this.enrollments.values()]
        .filter((e) => e.estanciaId === estanciaId && e.roomShift === shift)
        .map((e) => ({ enrollmentId: e.enrollmentId, childId: e.enrollmentId, childName: e.childName, enrollmentNumber: `M-${e.enrollmentId}`, roomId: 1, roomName: 'Sala', status: this.marks.get(e.enrollmentId)?.status ?? null, medicalLock: this.locked.has(e.enrollmentId) })),
    );
  }

  findEnrollments(estanciaId: number, ids: readonly number[]): Promise<EnrollmentForMarking[]> {
    return Promise.resolve(ids.flatMap((id) => { const e = this.enrollments.get(id); return e?.estanciaId === estanciaId ? [e] : []; }));
  }

  findLockedEnrollmentIds(_estanciaId: number, ids: readonly number[]): Promise<Set<number>> {
    return Promise.resolve(new Set(ids.filter((id) => this.locked.has(id))));
  }

  findMarks(_journeyId: number, ids: readonly number[]): Promise<ExistingMark[]> {
    return Promise.resolve(ids.flatMap((id) => { const m = this.marks.get(id); return m ? [{ enrollmentId: id, status: m.status }] : []; }));
  }

  findAppliedClientIds(clientIds: readonly string[]): Promise<Set<string>> {
    const applied = new Set([...this.marks.values()].map((m) => m.clientId));
    return Promise.resolve(new Set(clientIds.filter((id) => applied.has(id))));
  }

  async applyChanges(_journeyId: number, _userId: number, now: Date, changes: readonly MarkChange[], hook: MarkChangeHook): Promise<void> {
    this.appliedBatches.push([...changes]);
    this.appliedAt.push(now);
    for (const change of changes) {
      const current = this.marks.get(change.enrollmentId);
      const id = current?.id ?? this.nextId++;
      this.marks.set(change.enrollmentId, { id, status: change.status, clientId: current?.clientId ?? change.clientId });
      await hook({} as Parameters<MarkChangeHook>[0], change, id);
    }
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

const batch = (...marks: Array<[number, MarkAttendanceRequest['marks'][number]['status'], number?]>): MarkAttendanceRequest => ({
  marks: marks.map(([enrollmentId, status, n]) => ({ enrollmentId, status, clientId: uuid(n ?? enrollmentId), method: 'MANUAL' as const })),
});

describe('AttendanceRecordsService', () => {
  let journeys: FakeJourneys;
  let records: FakeRecords;
  let audit: RecordingAudit;
  let service: AttendanceRecordsService;

  beforeEach(() => {
    journeys = new FakeJourneys();
    records = new FakeRecords();
    audit = new RecordingAudit();
    for (const id of [1, 2, 3]) records.enrollments.set(id, { enrollmentId: id, roomShift: 'MATUTINO', estanciaId: 7, childName: `Infante ${id}` });
    service = new AttendanceRecordsService(journeys as unknown as AttendanceJourneysRepository, records, audit as unknown as AuditService, () => new Date('2026-10-15T14:00:00Z'));
  });

  it('registra un lote en una sola transacción y audita cada marca', async () => {
    const result = await service.mark(auth, 1, batch([1, 'PRESENTE'], [2, 'FALTA_INJUSTIFICADA'], [3, 'PRESENTE']), request);
    expect(result).toEqual({ saved: 3, unchanged: 0 });
    expect(records.appliedBatches).toHaveLength(1);
    expect(audit.entries.map((e) => e.action)).toEqual(['ASISTENCIA_REGISTRADA', 'ASISTENCIA_REGISTRADA', 'ASISTENCIA_REGISTRADA']);
    expect(audit.entries[1]).toMatchObject({ tableName: 'asistencias', roleCode: 'DOCENTE', after: { status: 'FALTA_INJUSTIFICADA', enrollmentId: 2 } });
  });

  it('un cambio de estado se audita con el antes y el después', async () => {
    await service.mark(auth, 1, batch([2, 'PRESENTE']), request);
    audit.entries.length = 0;
    const result = await service.mark(auth, 1, batch([2, 'FALTA_INJUSTIFICADA', 20]), request);
    expect(result).toEqual({ saved: 1, unchanged: 0 });
    expect(audit.entries[0]).toMatchObject({ action: 'ASISTENCIA_MODIFICADA', before: { status: 'PRESENTE' }, after: { status: 'FALTA_INJUSTIFICADA' } });
  });

  it('un reintento con la misma operación no duplica ni audita', async () => {
    await service.mark(auth, 1, batch([1, 'PRESENTE']), request);
    audit.entries.length = 0;
    expect(await service.mark(auth, 1, batch([1, 'PRESENTE']), request)).toEqual({ saved: 0, unchanged: 1 });
    expect(audit.entries).toHaveLength(0);
  });

  it('repetir el mismo estado con otra operación tampoco cambia nada', async () => {
    await service.mark(auth, 1, batch([1, 'PRESENTE']), request);
    expect(await service.mark(auth, 1, batch([1, 'PRESENTE', 99]), request)).toEqual({ saved: 0, unchanged: 1 });
  });

  it('solo aplica lo nuevo cuando el lote mezcla reintentos y marcas nuevas', async () => {
    await service.mark(auth, 1, batch([1, 'PRESENTE']), request);
    expect(await service.mark(auth, 1, batch([1, 'PRESENTE'], [2, 'PRESENTE']), request)).toEqual({ saved: 1, unchanged: 1 });
  });

  it('rechaza todo el lote si algún infante no está inscrito en la estancia', async () => {
    records.enrollments.set(9, { enrollmentId: 9, roomShift: 'MATUTINO', estanciaId: 99, childName: 'Ajeno' });
    await expect(service.mark(auth, 1, batch([1, 'PRESENTE'], [9, 'PRESENTE']), request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
    expect(records.appliedBatches).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('rechaza infantes de otro turno', async () => {
    records.enrollments.set(4, { enrollmentId: 4, roomShift: 'VESPERTINO', estanciaId: 7, childName: 'Tarde' });
    await expect(service.mark(auth, 1, batch([4, 'PRESENTE']), request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
  });

  it('no registra en una jornada cerrada', async () => {
    journeys.rows.set(1, journey({ status: 'CERRADA', closedAt: new Date(), closedBy: 5 }));
    await expect(service.mark(auth, 1, batch([1, 'PRESENTE']), request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(records.appliedBatches).toHaveLength(0);
  });

  it('una jornada de otra estancia no existe', async () => {
    journeys.rows.set(1, journey({ estanciaId: 99 }));
    await expect(service.mark(auth, 1, batch([1, 'PRESENTE']), request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(service.roster(auth, 1, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('exige una estancia activa', async () => {
    const sinEstancia = { ...auth, activeEstanciaId: null };
    await expect(service.mark(sinEstancia, 1, batch([1, 'PRESENTE']), request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    await expect(service.roster(sinEstancia, 1, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });

  it('la lista trae a los infantes del turno con su estado y audita la lectura', async () => {
    records.enrollments.set(4, { enrollmentId: 4, roomShift: 'VESPERTINO', estanciaId: 7, childName: 'Tarde' });
    await service.mark(auth, 1, batch([1, 'PRESENTE']), request);
    audit.entries.length = 0;
    const entries = await service.roster(auth, 1, request);
    expect(entries.map((e) => [e.enrollmentId, e.status])).toEqual([[1, 'PRESENTE'], [2, null], [3, null]]);
    expect(audit.entries[0]).toMatchObject({ action: 'LISTA_ASISTENCIA_CONSULTADA', recordId: '1' });
  });

  it('un infante con candado médico no puede marcarse presente: se rechaza todo el lote', async () => {
    records.locked.add(2);
    await expect(service.mark(auth, 1, batch([1, 'PRESENTE'], [2, 'PRESENTE']), request)).rejects.toMatchObject({ code: 'CONFLICTO', message: containing('alta médica') });
    expect(records.appliedBatches).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('con candado médico sí se puede registrar otro estado, como ausencia o comisión médica', async () => {
    records.locked.add(2);
    expect(await service.mark(auth, 1, batch([2, 'AUSENTE_JUSTIFICADO'], [1, 'PRESENTE']), request)).toEqual({ saved: 2, unchanged: 0 });
    expect(await service.mark(auth, 1, batch([2, 'COMISION_MEDICA', 22]), request)).toEqual({ saved: 1, unchanged: 0 });
  });

  it('liberado el candado, el infante vuelve a poder marcarse presente', async () => {
    records.locked.add(2);
    records.locked.delete(2);
    expect(await service.mark(auth, 1, batch([2, 'PRESENTE']), request)).toEqual({ saved: 1, unchanged: 0 });
  });

  it('la lista indica qué infantes tienen candado médico, sin decir por qué', async () => {
    records.locked.add(3);
    const entries = await service.roster(auth, 1, request);
    expect(entries.map((e) => [e.enrollmentId, e.medicalLock])).toEqual([[1, false], [2, false], [3, true]]);
  });

  describe('markPartial (captura sin conexión)', () => {
    const CAPTURED = new Date('2026-10-15T13:30:00Z');
    const partial = (input: ReturnType<typeof batch>, capturedAt = CAPTURED) => service.markPartial(auth, 1, input, capturedAt, request);

    it('aplica lo válido y reporta cada rechazo con su infante y su motivo, sin tumbar el resto', async () => {
      records.enrollments.set(4, { enrollmentId: 4, roomShift: 'VESPERTINO', estanciaId: 7, childName: 'Tarde' });
      records.enrollments.set(9, { enrollmentId: 9, roomShift: 'MATUTINO', estanciaId: 99, childName: 'Ajeno' });
      records.locked.add(3);
      const result = await partial(batch([1, 'PRESENTE'], [2, 'FALTA_INJUSTIFICADA'], [3, 'PRESENTE'], [4, 'PRESENTE'], [9, 'PRESENTE'], [88, 'PRESENTE']));
      expect(result.saved).toBe(2);
      expect([...result.rejections].sort((a, b) => (a.ref ?? 0) - (b.ref ?? 0)).map((r) => [r.ref, r.code])).toEqual([[3, 'CANDADO_MEDICO'], [4, 'TURNO_DISTINTO'], [9, 'INSCRIPCION_INVALIDA'], [88, 'INSCRIPCION_INVALIDA']]);
      expect(records.marks.has(1)).toBe(true);
      expect(records.marks.has(3)).toBe(false);
      expect(audit.entries.filter((e) => e.action === 'ASISTENCIA_REGISTRADA')).toHaveLength(2);
    });

    it('si todo se rechaza no escribe ni audita nada', async () => {
      records.locked.add(1);
      const result = await partial(batch([1, 'PRESENTE']));
      expect(result).toMatchObject({ saved: 0, unchanged: 0, rejections: [{ ref: 1, code: 'CANDADO_MEDICO' }] });
      expect(records.appliedBatches).toHaveLength(0);
      expect(audit.entries).toHaveLength(0);
    });

    it('registra con la hora en que se capturó, no con la de la sincronización', async () => {
      await partial(batch([1, 'PRESENTE']));
      expect(records.appliedAt).toEqual([CAPTURED]);
      expect(audit.entries[0]?.after).toMatchObject({ capturedAt: CAPTURED.toISOString() });
    });

    it('una hora de captura en el futuro se ajusta a la hora del servidor', async () => {
      await partial(batch([1, 'PRESENTE']), new Date('2026-10-15T23:00:00Z'));
      expect(records.appliedAt).toEqual([new Date('2026-10-15T14:00:00Z')]);
    });

    it('un reintento con las mismas operaciones no duplica ni audita', async () => {
      await partial(batch([1, 'PRESENTE']));
      audit.entries.length = 0;
      expect(await partial(batch([1, 'PRESENTE']))).toMatchObject({ saved: 0, unchanged: 1, rejections: [] });
      expect(audit.entries).toHaveLength(0);
    });

    it('acepta captura tardía en una jornada que se cerró después de capturar (sin pérdida de datos)', async () => {
      journeys.rows.set(1, journey({ status: 'CERRADA', closedAt: new Date('2026-10-15T13:45:00Z'), closedBy: 5 }));
      await expect(partial(batch([1, 'PRESENTE']), CAPTURED)).resolves.toMatchObject({ saved: 1 });
    });

    it('rechaza toda la captura si se hizo después de que la jornada se cerró', async () => {
      journeys.rows.set(1, journey({ status: 'CERRADA', closedAt: new Date('2026-10-15T13:00:00Z'), closedBy: 5 }));
      await expect(partial(batch([1, 'PRESENTE']), CAPTURED)).rejects.toMatchObject({ code: 'CONFLICTO' });
      expect(records.appliedBatches).toHaveLength(0);
    });

    it('una jornada de otra estancia no existe y se exige estancia activa', async () => {
      journeys.rows.set(1, journey({ estanciaId: 99 }));
      await expect(partial(batch([1, 'PRESENTE']))).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
      await expect(service.markPartial({ ...auth, activeEstanciaId: null }, 1, batch([1, 'PRESENTE']), CAPTURED, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    });
  });
});
