import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { packIp } from '../../../common/http/request-context';
import { RecordingAudit, request, testEnv } from '../../identity/__tests__/in-memory';
import type { AuditFacets, AuditFilters, AuditRow } from '../audit-query.types';
import type { AuditQueryRepository } from '../repositories/audit-query.repository';
import { AuditQueryService } from '../services/audit-query.service';

const admin: AuthContext = {
  sessionId: 1,
  userId: 100,
  principal: { userId: 100, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] },
  activeEstanciaId: null,
};

class InMemoryAuditQuery implements AuditQueryRepository {
  rows: AuditRow[] = [];
  lastFilters: AuditFilters | null = null;
  lastLimit = 0;

  list(filters: AuditFilters, limit: number): Promise<AuditRow[]> {
    this.lastFilters = filters;
    this.lastLimit = limit;
    return Promise.resolve(this.rows.filter((row) => filters.beforeId === undefined || row.id < filters.beforeId).sort((a, b) => b.id - a.id).slice(0, limit));
  }

  facets(): Promise<AuditFacets> {
    return Promise.resolve({ actions: ['LOGIN', 'INFANTE_ACTUALIZADO'], tables: ['infantes', 'usuarios'] });
  }
}

describe('AuditQueryService (RF-11)', () => {
  const encryption = new EncryptionService(testEnv);
  let repo: InMemoryAuditQuery;
  let audit: RecordingAudit;
  let service: AuditQueryService;

  const row = (id: number, overrides: Partial<AuditRow> = {}): AuditRow => ({
    id,
    occurredAt: new Date('2026-10-18T12:00:00Z'),
    userId: 3,
    userName: 'Directora Prueba',
    systemName: null,
    roleCode: 'DIRECTORA',
    action: 'INFANTE_ACTUALIZADO',
    tableName: 'infantes',
    recordId: '12',
    ipAddress: packIp('10.0.0.5'),
    userAgent: 'Mozilla/5.0',
    previousDataEncrypted: null,
    newDataEncrypted: encryption.encryptJson({ fields: ['name', 'birthDate'] }),
    ...overrides,
  });

  beforeEach(() => {
    repo = new InMemoryAuditQuery();
    audit = new RecordingAudit();
    service = new AuditQueryService(repo, encryption, audit.asService());
  });

  it('devuelve el renglón con la IP legible y solo los nombres de los campos cambiados', async () => {
    repo.rows = [row(1)];
    const { entries } = await service.list(admin, { limit: 50 }, request);
    expect(entries[0]).toEqual({
      id: 1,
      occurredAt: '2026-10-18T12:00:00.000Z',
      userId: 3,
      userName: 'Directora Prueba',
      systemName: null,
      roleCode: 'DIRECTORA',
      action: 'INFANTE_ACTUALIZADO',
      tableName: 'infantes',
      recordId: '12',
      ipAddress: '10.0.0.5',
      userAgent: 'Mozilla/5.0',
      changedFields: ['birthDate', 'name'],
    });
  });

  it('nunca expone valores: ni de antes ni de después, aunque el cambio los traiga', async () => {
    repo.rows = [
      row(1, {
        previousDataEncrypted: encryption.encryptJson({ phone: '5512345678', disabilityGroup: 'Motriz' }),
        newDataEncrypted: encryption.encryptJson({ phone: '5598765432', email: 'tutor@ejemplo.test' }),
      }),
    ];
    const response = await service.list(admin, { limit: 50 }, request);
    const text = JSON.stringify(response);
    expect(text).not.toMatch(/5512345678|5598765432|Motriz|ejemplo\.test/);
    expect(response.entries[0]?.changedFields).toEqual(['disabilityGroup', 'email', 'phone']);
  });

  it('un renglón hecho por un sistema externo trae su nombre en vez de una persona', async () => {
    repo.rows = [row(1, { userId: null, userName: null, systemName: 'Tablero institucional', roleCode: null })];
    const { entries } = await service.list(admin, { limit: 50 }, request);
    expect(entries[0]).toMatchObject({ userId: null, userName: null, systemName: 'Tablero institucional' });
  });

  it('un renglón sin cambio o con el cifrado dañado se muestra igual, sin campos', async () => {
    repo.rows = [row(1, { newDataEncrypted: null }), row(2, { newDataEncrypted: Buffer.from('dañado') })];
    const { entries } = await service.list(admin, { limit: 50 }, request);
    expect(entries.map((e) => e.changedFields)).toEqual([[], []]);
  });

  it('pagina por cursor: pide uno más para saber si hay otra página', async () => {
    repo.rows = [row(1), row(2), row(3)];
    const first = await service.list(admin, { limit: 2 }, request);
    expect(repo.lastLimit).toBe(3);
    expect(first.entries.map((e) => e.id)).toEqual([3, 2]);
    expect(first.nextBeforeId).toBe(2);
    const second = await service.list(admin, { limit: 2, beforeId: first.nextBeforeId ?? 0 }, request);
    expect(second.entries.map((e) => e.id)).toEqual([1]);
    expect(second.nextBeforeId).toBeNull();
  });

  it('pasa los filtros al repositorio con las fechas como fecha', async () => {
    await service.list(admin, { limit: 10, from: '2026-10-01T06:00:00.000Z', to: '2026-10-02T05:59:59.999Z', userId: 3, action: 'LOGIN', table: 'usuarios', recordId: '5' }, request);
    expect(repo.lastFilters).toEqual({
      from: new Date('2026-10-01T06:00:00.000Z'),
      to: new Date('2026-10-02T05:59:59.999Z'),
      userId: 3,
      action: 'LOGIN',
      table: 'usuarios',
      recordId: '5',
    });
  });

  it('consultar la bitácora también queda en la bitácora, sin los filtros ni los resultados', async () => {
    repo.rows = [row(1)];
    await service.list(admin, { limit: 50, userId: 3 }, request);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ action: 'AUDITORIA_CONSULTADA', userId: 100, roleCode: 'ADMIN_CENTRAL', tableName: 'auditoria', recordId: null });
  });

  it('entrega los filtros disponibles', async () => {
    expect(await service.filters()).toEqual({ actions: ['LOGIN', 'INFANTE_ACTUALIZADO'], tables: ['infantes', 'usuarios'] });
  });
});
