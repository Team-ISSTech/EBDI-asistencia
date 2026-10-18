import type { EstanciaUsage } from '@sirai/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import type { EstanciaChanges, EstanciaRecord, NewEstancia } from '../administration.types';
import type { AdminHook, EstanciasAdminRepository } from '../repositories/estancias-admin.repository';
import { EstanciasAdminService } from '../services/estancias-admin.service';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const admin: AuthContext = { sessionId: 1, userId: 1, principal: { userId: 1, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] }, activeEstanciaId: null };

class FakeRepo implements EstanciasAdminRepository {
  rows = new Map<number, EstanciaRecord>();
  retired: number[] = [];
  usageById = new Map<number, EstanciaUsage>();
  private nextId = 1;
  list(): Promise<EstanciaRecord[]> {
    return Promise.resolve([...this.rows.values()]);
  }
  findById(id: number): Promise<EstanciaRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  async create(input: NewEstancia, _now: Date, hook: AdminHook<number>): Promise<number> {
    if ([...this.rows.values()].some((row) => row.code === input.code)) throw new ApiError('CONFLICTO', 'Ya existe una estancia con esa clave EBDI.');
    const id = this.nextId++;
    this.rows.set(id, { id, ...input, status: 'ACTIVA' });
    await hook({} as never, id);
    return id;
  }
  async update(id: number, changes: EstanciaChanges, _now: Date, hook: AdminHook<void>): Promise<void> {
    this.rows.set(id, { ...(this.rows.get(id) as EstanciaRecord), ...changes });
    await hook({} as never, undefined);
  }
  async retire(id: number, _userId: number, _now: Date, hook: AdminHook<void>): Promise<void> {
    this.retired.push(id);
    this.rows.delete(id);
    await hook({} as never, undefined);
  }
  usage(id: number): Promise<EstanciaUsage> {
    return Promise.resolve(this.usageById.get(id) ?? { activeEnrollments: 0, openJourneys: 0 });
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

const input = { code: 'EBDI-001', name: 'Estancia Uno', ur: null, region: 'Norte', address: null, timeZone: 'America/Mexico_City' };

describe('EstanciasAdminService (RF-31)', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: EstanciasAdminService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    service = new EstanciasAdminService(repo, audit as unknown as AuditService, () => new Date('2026-10-16T12:00:00Z'));
  });

  it('crea la estancia activa y audita el alta con el rol del actor', async () => {
    const created = await service.create(admin, input, request);
    expect(created).toMatchObject({ code: 'EBDI-001', name: 'Estancia Uno', status: 'ACTIVA', timeZone: 'America/Mexico_City' });
    expect(audit.entries[0]).toMatchObject({ action: 'ESTANCIA_CREADA', roleCode: 'ADMIN_CENTRAL', tableName: 'estancias', recordId: String(created.id), after: { code: 'EBDI-001', region: 'Norte' } });
  });

  it('rechaza una clave EBDI repetida sin auditar', async () => {
    await service.create(admin, input, request);
    audit.entries.length = 0;
    await expect(service.create(admin, input, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(audit.entries).toHaveLength(0);
  });

  it('lista todas las estancias, también las inactivas', async () => {
    const created = await service.create(admin, input, request);
    await service.update(admin, created.id, { status: 'INACTIVA' }, request);
    expect((await service.list()).map((row) => row.status)).toEqual(['INACTIVA']);
  });

  it('actualiza datos y audita el antes y el después solo de lo que cambió', async () => {
    const created = await service.create(admin, input, request);
    audit.entries.length = 0;
    const updated = await service.update(admin, created.id, { name: 'Nombre nuevo', region: 'Sur' }, request);
    expect(updated).toMatchObject({ name: 'Nombre nuevo', region: 'Sur', code: 'EBDI-001' });
    expect(audit.entries[0]).toMatchObject({ action: 'ESTANCIA_ACTUALIZADA', before: { name: 'Estancia Uno', region: 'Norte' }, after: { name: 'Nombre nuevo', region: 'Sur' } });
  });

  it('un cambio que no cambia nada no se audita', async () => {
    const created = await service.create(admin, input, request);
    audit.entries.length = 0;
    await service.update(admin, created.id, { name: 'Estancia Uno' }, request);
    expect(audit.entries).toHaveLength(0);
  });

  it('no desactiva ni da de baja una estancia con inscritos activos o jornadas abiertas', async () => {
    const created = await service.create(admin, input, request);
    repo.usageById.set(created.id, { activeEnrollments: 4, openJourneys: 0 });
    await expect(service.update(admin, created.id, { status: 'INACTIVA' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    await expect(service.retire(admin, created.id, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    repo.usageById.set(created.id, { activeEnrollments: 0, openJourneys: 2 });
    await expect(service.retire(admin, created.id, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(repo.retired).toEqual([]);
  });

  it('da de baja con borrado lógico una estancia sin uso y lo audita', async () => {
    const created = await service.create(admin, input, request);
    audit.entries.length = 0;
    await service.retire(admin, created.id, request);
    expect(repo.retired).toEqual([created.id]);
    expect(audit.entries[0]).toMatchObject({ action: 'ESTANCIA_DADA_DE_BAJA', recordId: String(created.id), before: { code: 'EBDI-001', status: 'ACTIVA' } });
  });

  it('una estancia inexistente responde NO_ENCONTRADO', async () => {
    await expect(service.update(admin, 99, { name: 'X' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(service.retire(admin, 99, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('reactivar una estancia inactiva no exige revisión de uso', async () => {
    const created = await service.create(admin, input, request);
    await service.update(admin, created.id, { status: 'INACTIVA' }, request);
    repo.usageById.set(created.id, { activeEnrollments: 9, openJourneys: 9 });
    await expect(service.update(admin, created.id, { status: 'ACTIVA' }, request)).resolves.toMatchObject({ status: 'ACTIVA' });
  });
});
