import { createHash } from 'node:crypto';
import type { Principal } from '@sirai/auth';
import type { AttendanceMark, SyncOperation, SyncRequest } from '@sirai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import { canonicalJson } from '../../../common/util/canonical-json.js';
import type { AttendanceRecordsService, PartialMarkResult } from '../../attendance/services/records.service.js';
import type { FollowUpsService } from '../../follow-ups/services/follow-ups.service.js';
import type { SyncRepository } from '../repositories/sync.repository.js';
import { SyncService } from '../services/sync.service.js';
import type { StoredOperation } from '../sync.types.js';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const principalOf = (role: 'DOCENTE' | 'TRABAJO_SOCIAL'): Principal => ({ userId: 5, assignments: [{ role, estanciaId: 7 }] });
const authOf = (role: 'DOCENTE' | 'TRABAJO_SOCIAL' = 'DOCENTE', activeEstanciaId: number | null = 7): AuthContext => ({ sessionId: 1, userId: 5, principal: principalOf(role), activeEstanciaId });
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CAPTURED = '2026-10-15T13:30:00.000Z';

const marksOp = (n: number, marks: AttendanceMark[] = [{ enrollmentId: 1, status: 'PRESENTE', clientId: uuid(100 + n), method: 'MANUAL' }]): SyncOperation => ({
  operationId: uuid(n), type: 'ATTENDANCE_MARKS', capturedAt: CAPTURED, payload: { journeyId: 3, marks },
});
const contactOp = (n: number): SyncOperation => ({
  operationId: uuid(n), type: 'FOLLOW_UP_CONTACT', capturedAt: CAPTURED, payload: { followUpId: 4, contact: { result: 'SIN_RESPUESTA' } },
});
const batch = (...operations: SyncOperation[]): SyncRequest => ({ operations });

class FakeSyncRepo implements SyncRepository {
  rows = new Map<string, StoredOperation>();
  raceOnSave = false;
  find(operationId: string): Promise<StoredOperation | null> {
    return Promise.resolve(this.rows.get(operationId) ?? null);
  }
  save(operation: StoredOperation): Promise<boolean> {
    if (this.raceOnSave || this.rows.has(operation.operationId)) {
      this.raceOnSave = false;
      return Promise.resolve(false);
    }
    this.rows.set(operation.operationId, operation);
    return Promise.resolve(true);
  }
}

class FakeAttendance {
  calls: Array<{ journeyId: number; marks: number; capturedAt: Date }> = [];
  result: PartialMarkResult = { saved: 1, unchanged: 0, rejections: [] };
  failWith: Error | null = null;
  markPartial(_auth: AuthContext, journeyId: number, input: { marks: unknown[] }, capturedAt: Date): Promise<PartialMarkResult> {
    this.calls.push({ journeyId, marks: input.marks.length, capturedAt });
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve(this.result);
  }
}

class FakeFollowUps {
  calls: Array<{ followUpId: number; operationId: string | undefined; at: Date | undefined }> = [];
  failWith: Error | null = null;
  registerContact(_auth: AuthContext, followUpId: number, _input: unknown, _request: RequestContext, origin: { operationId?: string; at?: Date }): Promise<unknown> {
    this.calls.push({ followUpId, operationId: origin.operationId, at: origin.at });
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve({ id: followUpId });
  }
}

describe('SyncService (RF-20 a RF-23)', () => {
  let repo: FakeSyncRepo;
  let attendance: FakeAttendance;
  let followUps: FakeFollowUps;
  let service: SyncService;

  beforeEach(() => {
    repo = new FakeSyncRepo();
    attendance = new FakeAttendance();
    followUps = new FakeFollowUps();
    service = new SyncService(repo, attendance as unknown as AttendanceRecordsService, followUps as unknown as FollowUpsService);
  });

  it('aplica una operación de pase de lista con la hora en que se capturó y devuelve su acuse', async () => {
    const { results } = await service.process(authOf(), batch(marksOp(1)), request);
    expect(results).toEqual([{ operationId: uuid(1), status: 'APLICADA', replayed: false, saved: 1, unchanged: 0, rejections: [], code: null, message: null }]);
    expect(attendance.calls).toEqual([{ journeyId: 3, marks: 1, capturedAt: new Date(CAPTURED) }]);
  });

  it('guarda el acuse y, ante un reintento, devuelve el mismo sin repetir el efecto', async () => {
    await service.process(authOf(), batch(marksOp(1)), request);
    const { results } = await service.process(authOf(), batch(marksOp(1)), request);
    expect(results[0]).toMatchObject({ operationId: uuid(1), status: 'APLICADA', replayed: true, saved: 1 });
    expect(attendance.calls).toHaveLength(1);
    expect(repo.rows.get(uuid(1))).toMatchObject({ userId: 5, estanciaId: 7, entity: 'ASISTENCIA', status: 'APLICADA' });
  });

  it('un lote mezcla operaciones nuevas y reintentadas, y conserva el orden', async () => {
    await service.process(authOf(), batch(marksOp(1)), request);
    const { results } = await service.process(authOf(), batch(marksOp(2), marksOp(1), marksOp(3)), request);
    expect(results.map((r) => [r.operationId, r.replayed])).toEqual([[uuid(2), false], [uuid(1), true], [uuid(3), false]]);
    expect(attendance.calls).toHaveLength(3);
  });

  it('un resultado parcial lleva el estado PARCIAL y el detalle de cada rechazo', async () => {
    attendance.result = { saved: 1, unchanged: 0, rejections: [{ ref: 9, code: 'CANDADO_MEDICO', message: 'Requiere alta.' }] };
    const { results } = await service.process(authOf(), batch(marksOp(1)), request);
    expect(results[0]).toMatchObject({ status: 'PARCIAL', saved: 1, rejections: [{ ref: 9, code: 'CANDADO_MEDICO' }] });
  });

  it('si ninguna marca es válida la operación se rechaza completa', async () => {
    attendance.result = { saved: 0, unchanged: 0, rejections: [{ ref: 9, code: 'CANDADO_MEDICO', message: 'Requiere alta.' }] };
    const { results } = await service.process(authOf(), batch(marksOp(1)), request);
    expect(results[0]).toMatchObject({ status: 'RECHAZADA', code: 'SIN_MARCAS_VALIDAS', saved: 0 });
  });

  it('un rechazo del dominio (jornada cerrada, inexistente) no tumba el resto del lote y también se guarda', async () => {
    attendance.failWith = new ApiError('CONFLICTO', 'La jornada ya estaba cerrada cuando se capturó.');
    const first = await service.process(authOf(), batch(marksOp(1)), request);
    expect(first.results[0]).toMatchObject({ status: 'RECHAZADA', code: 'CONFLICTO', message: 'La jornada ya estaba cerrada cuando se capturó.' });
    attendance.failWith = null;
    const again = await service.process(authOf(), batch(marksOp(1), marksOp(2)), request);
    expect(again.results[0]).toMatchObject({ status: 'RECHAZADA', replayed: true });
    expect(again.results[1]).toMatchObject({ status: 'APLICADA', replayed: false });
  });

  it('una falla inesperada no se guarda: la operación se podrá reintentar', async () => {
    attendance.failWith = new Error('conexión perdida con la base');
    await expect(service.process(authOf(), batch(marksOp(1)), request)).rejects.toThrow('conexión perdida');
    expect(repo.rows.size).toBe(0);
    attendance.failWith = null;
    const { results } = await service.process(authOf(), batch(marksOp(1)), request);
    expect(results[0]).toMatchObject({ status: 'APLICADA', replayed: false });
  });

  it('rechaza una operación para la que el usuario no tiene permiso, sin ejecutarla', async () => {
    const { results } = await service.process(authOf('TRABAJO_SOCIAL'), batch(marksOp(1)), request);
    expect(results[0]).toMatchObject({ status: 'RECHAZADA', code: 'SIN_PERMISO' });
    expect(attendance.calls).toHaveLength(0);
    const docente = await service.process(authOf('DOCENTE'), batch(contactOp(2)), request);
    expect(docente.results[0]).toMatchObject({ status: 'RECHAZADA', code: 'SIN_PERMISO' });
    expect(followUps.calls).toHaveLength(0);
  });

  it('aplica una llamada de seguimiento con su UUID de operación y la hora de captura', async () => {
    const { results } = await service.process(authOf('TRABAJO_SOCIAL'), batch(contactOp(2)), request);
    expect(results[0]).toMatchObject({ operationId: uuid(2), status: 'APLICADA', saved: 1 });
    expect(followUps.calls).toEqual([{ followUpId: 4, operationId: uuid(2), at: new Date(CAPTURED) }]);
    expect(repo.rows.get(uuid(2))?.entity).toBe('CONTACTO_SEGUIMIENTO');
  });

  it('el mismo UUID con otro contenido no se reutiliza', async () => {
    await service.process(authOf(), batch(marksOp(1)), request);
    const tampered = marksOp(1, [{ enrollmentId: 99, status: 'FALTA_INJUSTIFICADA', clientId: uuid(500), method: 'MANUAL' }]);
    const { results } = await service.process(authOf(), batch(tampered), request);
    expect(results[0]).toMatchObject({ status: 'RECHAZADA', code: 'OPERACION_REUTILIZADA', replayed: false });
    expect(attendance.calls).toHaveLength(1);
  });

  it('el acuse de otro usuario o de otra estancia no se entrega', async () => {
    await service.process(authOf(), batch(marksOp(1)), request);
    const otherUser = { ...authOf(), userId: 6 };
    expect((await service.process(otherUser, batch(marksOp(1)), request)).results[0]).toMatchObject({ status: 'RECHAZADA', code: 'OPERACION_REUTILIZADA' });
    const otherEstancia = authOf('DOCENTE', 8);
    expect((await service.process({ ...otherEstancia, principal: { userId: 5, assignments: [{ role: 'DOCENTE', estanciaId: 8 }] } }, batch(marksOp(1)), request)).results[0]).toMatchObject({ code: 'OPERACION_REUTILIZADA' });
  });

  it('dos peticiones que reintentan a la vez: la que pierde la carrera devuelve el acuse de la que ganó', async () => {
    await service.process(authOf(), batch(marksOp(1)), request);
    const racing = new FakeSyncRepo();
    racing.rows = new Map(repo.rows);
    racing.find = (id: string) => Promise.resolve(racing.raceOnSave ? null : (racing.rows.get(id) ?? null));
    racing.raceOnSave = true;
    const racingService = new SyncService(racing, attendance as unknown as AttendanceRecordsService, followUps as unknown as FollowUpsService);
    const { results } = await racingService.process(authOf(), batch(marksOp(1)), request);
    expect(results[0]).toMatchObject({ status: 'APLICADA', replayed: true });
  });

  it('exige una estancia activa', async () => {
    await expect(service.process(authOf('DOCENTE', null), batch(marksOp(1)), request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });

  it('la huella del contenido cubre el tipo y la carga, no la hora de captura', () => {
    const op = marksOp(1);
    const a = createHash('sha256').update(canonicalJson({ type: op.type, payload: op.payload })).digest('hex');
    const b = createHash('sha256').update(canonicalJson({ payload: op.payload, type: op.type })).digest('hex');
    expect(a).toBe(b);
  });
});
