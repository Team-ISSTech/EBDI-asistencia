import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import type { AdminRoomRecord, NewRoom, RoomChanges } from '../administration.types';
import type { AdminHook } from '../repositories/estancias-admin.repository';
import type { RoomsAdminRepository } from '../repositories/rooms-admin.repository';
import { RoomsAdminService } from '../services/rooms-admin.service';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const directora: AuthContext = { sessionId: 1, userId: 10, principal: { userId: 10, assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] }, activeEstanciaId: 1 };

class FakeRepo implements RoomsAdminRepository {
  rows = new Map<number, AdminRoomRecord>();
  retired: number[] = [];
  private nextId = 1;
  list(estanciaId: number): Promise<AdminRoomRecord[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.estanciaId === estanciaId));
  }
  findById(id: number): Promise<AdminRoomRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  async create(input: NewRoom, _now: Date, hook: AdminHook<number>): Promise<number> {
    if ([...this.rows.values()].some((row) => row.estanciaId === input.estanciaId && row.name === input.name && row.shift === input.shift)) {
      throw new ApiError('CONFLICTO', 'Ya existe una sala con ese nombre y turno.');
    }
    const id = this.nextId++;
    this.rows.set(id, { id, ...input, status: 'ACTIVO', enrolled: 0 });
    await hook({} as never, id);
    return id;
  }
  async update(id: number, changes: RoomChanges, _now: Date, hook: AdminHook<void>): Promise<void> {
    this.rows.set(id, { ...(this.rows.get(id) as AdminRoomRecord), ...changes });
    await hook({} as never, undefined);
  }
  async retire(id: number, _userId: number, _now: Date, hook: AdminHook<void>): Promise<void> {
    this.retired.push(id);
    this.rows.delete(id);
    await hook({} as never, undefined);
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

const input = { name: 'Lactantes A', shift: 'MATUTINO' as const, minAgeMonths: 0, maxAgeMonths: 18, capacity: 12 };

describe('RoomsAdminService (RF-32)', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: RoomsAdminService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    service = new RoomsAdminService(repo, audit as unknown as AuditService, () => new Date('2026-10-16T12:00:00Z'));
  });

  it('crea la sala en la estancia activa y la audita', async () => {
    const room = await service.create(directora, input, request);
    expect(room).toMatchObject({ estanciaId: 1, name: 'Lactantes A', shift: 'MATUTINO', capacity: 12, status: 'ACTIVO', enrolled: 0 });
    expect(audit.entries[0]).toMatchObject({ action: 'SALA_CREADA', roleCode: 'DIRECTORA', tableName: 'salas_grupos', recordId: String(room.id) });
  });

  it('rechaza una sala repetida (mismo nombre y turno) sin auditar', async () => {
    await service.create(directora, input, request);
    audit.entries.length = 0;
    await expect(service.create(directora, input, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(audit.entries).toHaveLength(0);
  });

  it('lista las salas de la estancia, también las inactivas, con sus inscritos', async () => {
    const room = await service.create(directora, input, request);
    repo.rows.set(room.id, { ...(repo.rows.get(room.id) as AdminRoomRecord), status: 'INACTIVO', enrolled: 3 });
    expect(await service.list(directora)).toEqual([expect.objectContaining({ id: room.id, status: 'INACTIVO', enrolled: 3 })]);
  });

  it('una sala de otra estancia no existe', async () => {
    const room = await service.create(directora, input, request);
    const other: AuthContext = { ...directora, activeEstanciaId: 2 };
    await expect(service.update(other, room.id, { name: 'X' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(service.retire(other, room.id, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(await service.list(other)).toEqual([]);
  });

  it('actualiza y audita el antes y el después solo de lo que cambió', async () => {
    const room = await service.create(directora, input, request);
    audit.entries.length = 0;
    const updated = await service.update(directora, room.id, { name: 'Lactantes B', capacity: 15 }, request);
    expect(updated).toMatchObject({ name: 'Lactantes B', capacity: 15 });
    expect(audit.entries[0]).toMatchObject({ action: 'SALA_ACTUALIZADA', before: { name: 'Lactantes A', capacity: 12 }, after: { name: 'Lactantes B', capacity: 15 } });
  });

  it('no cambia el turno de una sala con infantes inscritos', async () => {
    const room = await service.create(directora, input, request);
    repo.rows.set(room.id, { ...(repo.rows.get(room.id) as AdminRoomRecord), enrolled: 2 });
    await expect(service.update(directora, room.id, { shift: 'VESPERTINO' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    await expect(service.update(directora, room.id, { shift: 'MATUTINO' }, request)).resolves.toBeDefined();
  });

  it('no baja la capacidad por debajo de los inscritos, pero sí la quita o la sube', async () => {
    const room = await service.create(directora, input, request);
    repo.rows.set(room.id, { ...(repo.rows.get(room.id) as AdminRoomRecord), enrolled: 10 });
    await expect(service.update(directora, room.id, { capacity: 9 }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    await expect(service.update(directora, room.id, { capacity: 10 }, request)).resolves.toMatchObject({ capacity: 10 });
    await expect(service.update(directora, room.id, { capacity: null }, request)).resolves.toMatchObject({ capacity: null });
  });

  it('no desactiva ni da de baja una sala con inscritos activos', async () => {
    const room = await service.create(directora, input, request);
    repo.rows.set(room.id, { ...(repo.rows.get(room.id) as AdminRoomRecord), enrolled: 1 });
    await expect(service.update(directora, room.id, { status: 'INACTIVO' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    await expect(service.retire(directora, room.id, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(repo.retired).toEqual([]);
  });

  it('desactiva y reactiva una sala vacía', async () => {
    const room = await service.create(directora, input, request);
    await expect(service.update(directora, room.id, { status: 'INACTIVO' }, request)).resolves.toMatchObject({ status: 'INACTIVO' });
    await expect(service.update(directora, room.id, { status: 'ACTIVO' }, request)).resolves.toMatchObject({ status: 'ACTIVO' });
  });

  it('da de baja con borrado lógico una sala vacía y lo audita', async () => {
    const room = await service.create(directora, input, request);
    audit.entries.length = 0;
    await service.retire(directora, room.id, request);
    expect(repo.retired).toEqual([room.id]);
    expect(audit.entries[0]).toMatchObject({ action: 'SALA_DADA_DE_BAJA', recordId: String(room.id), before: { name: 'Lactantes A', shift: 'MATUTINO' } });
  });

  it('un rango de edad invertido por un cambio parcial se rechaza', async () => {
    const room = await service.create(directora, input, request);
    await expect(service.update(directora, room.id, { minAgeMonths: 30 }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
  });

  it('exige una estancia activa', async () => {
    const none: AuthContext = { ...directora, activeEstanciaId: null };
    await expect(service.create(none, input, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    await expect(service.list(none)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });
});
