import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { RecordingAudit, request } from '../../identity/__tests__/in-memory';
import { SchoolYearsService } from '../services/school-years.service';
import { InMemorySchoolYears } from './in-memory';

const NOW = new Date('2026-10-18T12:00:00Z');
const admin: AuthContext = {
  sessionId: 1,
  userId: 100,
  principal: { userId: 100, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] },
  activeEstanciaId: null,
};
const next = { code: '2027-2028', startDate: '2027-08-23', endDate: '2028-07-14' };

describe('ciclos escolares y retención (RNF-05)', () => {
  let years: InMemorySchoolYears;
  let audit: RecordingAudit;
  let service: SchoolYearsService;
  let currentId: number;

  beforeEach(() => {
    years = new InMemorySchoolYears();
    audit = new RecordingAudit();
    service = new SchoolYearsService(years, audit.asService(), () => NOW);
    currentId = years.seed({ code: '2026-2027', startDate: '2026-08-24', endDate: '2027-07-16', status: 'ACTIVO', archivedAt: null, purgedAt: null }).id;
  });

  describe('listado', () => {
    it('el ciclo activo trae lo que impide cerrarlo; los archivados, desde cuándo se pueden depurar', async () => {
      years.usages.set(currentId, { openJourneys: 2, openFollowUps: 1 });
      const old = years.seed({ code: '2019-2020', startDate: '2019-08-01', endDate: '2020-07-01', status: 'ARCHIVADO', archivedAt: new Date('2020-07-15T10:00:00Z'), purgedAt: null });
      const recent = years.seed({ code: '2024-2025', startDate: '2024-08-01', endDate: '2025-07-01', status: 'ARCHIVADO', archivedAt: new Date('2025-07-15T10:00:00Z'), purgedAt: null });
      const done = years.seed({ code: '2018-2019', startDate: '2018-08-01', endDate: '2019-07-01', status: 'ARCHIVADO', archivedAt: new Date('2019-07-15T10:00:00Z'), purgedAt: new Date('2026-01-01T00:00:00Z') });
      const list = await service.list();
      const byId = new Map(list.map((year) => [year.id, year]));
      expect(byId.get(currentId)).toMatchObject({ status: 'ACTIVO', archivedAt: null, purgeEligibleOn: null, canPurge: false, usage: { openJourneys: 2, openFollowUps: 1 } });
      expect(byId.get(old.id)).toMatchObject({ status: 'ARCHIVADO', purgeEligibleOn: '2025-07-15T10:00:00.000Z', canPurge: true, usage: null });
      expect(byId.get(recent.id)).toMatchObject({ purgeEligibleOn: '2030-07-15T10:00:00.000Z', canPurge: false });
      expect(byId.get(done.id)).toMatchObject({ purgedAt: '2026-01-01T00:00:00.000Z', canPurge: false });
    });
  });

  describe('abrir un ciclo nuevo (archiva el actual)', () => {
    it('archiva el activo, abre el nuevo y audita ambas cosas en la misma transacción', async () => {
      const created = await service.open(admin, next, request);
      expect(created).toMatchObject({ code: '2027-2028', status: 'ACTIVO', archivedAt: null });
      expect(years.rows.get(currentId)).toMatchObject({ status: 'ARCHIVADO', archivedAt: NOW });
      expect(years.archivedBy).toEqual([{ id: currentId, userId: 100 }]);
      expect(audit.entries.map((e) => e.action)).toEqual(['CICLO_ARCHIVADO', 'CICLO_ABIERTO']);
      expect(audit.entries[0]).toMatchObject({ recordId: String(currentId), userId: 100, roleCode: 'ADMIN_CENTRAL' });
      expect(audit.transactional).toBe(2);
    });

    it('no archiva con jornadas abiertas ni con seguimientos sin cerrar, y dice cuántos', async () => {
      years.usages.set(currentId, { openJourneys: 2, openFollowUps: 0 });
      await expect(service.open(admin, next, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: expect.stringContaining('2 jornadas abiertas') as string });
      years.usages.set(currentId, { openJourneys: 0, openFollowUps: 3 });
      await expect(service.open(admin, next, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: expect.stringContaining('3 seguimientos sin cerrar') as string });
      expect(years.rows.get(currentId)?.status).toBe('ACTIVO');
      expect(audit.entries).toHaveLength(0);
    });

    it('sin ciclo activo (instalación nueva) solo abre el primero, sin archivar nada', async () => {
      years.rows.clear();
      const created = await service.open(admin, next, request);
      expect(created.status).toBe('ACTIVO');
      expect(years.archivedBy).toHaveLength(0);
      expect(audit.entries.map((e) => e.action)).toEqual(['CICLO_ABIERTO']);
    });

    it('una clave repetida se rechaza sin archivar el ciclo actual', async () => {
      await expect(service.open(admin, { ...next, code: '2026-2027' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
      expect(years.rows.get(currentId)?.status).toBe('ACTIVO');
      expect(audit.entries).toHaveLength(0);
    });
  });

  describe('depuración', () => {
    let oldId: number;

    beforeEach(() => {
      oldId = years.seed({ code: '2019-2020', startDate: '2019-08-01', endDate: '2020-07-01', status: 'ARCHIVADO', archivedAt: new Date('2020-07-15T10:00:00Z'), purgedAt: null }).id;
      years.sensitive.set(oldId, { contacts: 4, releases: 2 });
    });

    it('vacía lo sensible de un ciclo con 5 años cumplidos, devuelve cuánto vació y audita con los conteos', async () => {
      const result = await service.purge(admin, oldId, { confirmCode: '2019-2020' }, request);
      expect(result).toEqual({ contacts: 4, releases: 2 });
      expect(years.purged).toEqual([{ id: oldId, userId: 100 }]);
      expect(audit.entries[0]).toMatchObject({ action: 'CICLO_DEPURADO', recordId: String(oldId), after: { code: '2019-2020', contacts: 4, releases: 2 } });
      expect(audit.transactional).toBe(1);
    });

    it('exige escribir la clave del ciclo, y no depura si no coincide', async () => {
      await expect(service.purge(admin, oldId, { confirmCode: '2020-2021' }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
      expect(years.purged).toHaveLength(0);
      expect(audit.entries).toHaveLength(0);
    });

    it('la clave se compara sin distinguir espacios de los extremos', async () => {
      await expect(service.purge(admin, oldId, { confirmCode: ' 2019-2020 ' }, request)).resolves.toBeDefined();
    });

    it('no depura el ciclo activo, uno archivado hace menos de 5 años ni uno ya depurado', async () => {
      await expect(service.purge(admin, currentId, { confirmCode: '2026-2027' }, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: expect.stringContaining('no está archivado') as string });
      const recent = years.seed({ code: '2024-2025', startDate: '2024-08-01', endDate: '2025-07-01', status: 'ARCHIVADO', archivedAt: new Date('2025-07-15T10:00:00Z'), purgedAt: null });
      await expect(service.purge(admin, recent.id, { confirmCode: '2024-2025' }, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: expect.stringContaining('2030') as string });
      await service.purge(admin, oldId, { confirmCode: '2019-2020' }, request);
      await expect(service.purge(admin, oldId, { confirmCode: '2019-2020' }, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: expect.stringContaining('ya se depuró') as string });
      expect(years.purged).toHaveLength(1);
    });

    it('un ciclo inexistente responde NO_ENCONTRADO', async () => {
      await expect(service.purge(admin, 999, { confirmCode: 'x' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    });
  });
});
