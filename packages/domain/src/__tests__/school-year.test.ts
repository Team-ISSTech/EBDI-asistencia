import { describe, expect, it } from 'vitest';
import { canArchiveSchoolYear, canPurgeSchoolYear, isPurgeEligible, purgeEligibleOn, RETENTION_YEARS } from '../school-year.js';

describe('retención de datos por ciclo escolar (RNF-05)', () => {
  it('un ciclo archivado se conserva 5 años antes de poder depurarse', () => {
    expect(RETENTION_YEARS).toBe(5);
  });

  describe('canArchiveSchoolYear', () => {
    it('se puede archivar cuando todo lo del ciclo está cerrado', () => {
      expect(canArchiveSchoolYear({ openJourneys: 0, openFollowUps: 0 })).toEqual({ ok: true });
    });

    it('no con jornadas abiertas, ni con seguimientos sin cerrar', () => {
      expect(canArchiveSchoolYear({ openJourneys: 2, openFollowUps: 0 })).toEqual({ ok: false, reason: 'CON_JORNADAS_ABIERTAS' });
      expect(canArchiveSchoolYear({ openJourneys: 0, openFollowUps: 3 })).toEqual({ ok: false, reason: 'CON_SEGUIMIENTOS_ABIERTOS' });
    });

    it('con ambas cosas avisa primero de las jornadas', () => {
      expect(canArchiveSchoolYear({ openJourneys: 1, openFollowUps: 1 })).toEqual({ ok: false, reason: 'CON_JORNADAS_ABIERTAS' });
    });
  });

  describe('purgeEligibleOn / isPurgeEligible', () => {
    const archivedAt = new Date('2026-07-15T10:00:00Z');

    it('se puede depurar a los 5 años justos de archivado', () => {
      expect(purgeEligibleOn(archivedAt).toISOString()).toBe('2031-07-15T10:00:00.000Z');
    });

    it('un instante antes todavía no; al cumplirse, sí', () => {
      expect(isPurgeEligible(archivedAt, new Date('2031-07-15T09:59:59Z'))).toBe(false);
      expect(isPurgeEligible(archivedAt, new Date('2031-07-15T10:00:00Z'))).toBe(true);
      expect(isPurgeEligible(archivedAt, new Date('2040-01-01T00:00:00Z'))).toBe(true);
    });

    it('un 29 de febrero se conserva hasta el 28 de febrero de un año sin bisiesto, nunca menos', () => {
      expect(purgeEligibleOn(new Date('2028-02-29T00:00:00Z')).toISOString()).toBe('2033-02-28T00:00:00.000Z');
    });
  });

  describe('canPurgeSchoolYear', () => {
    const old = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2026-10-18T00:00:00Z');

    it('procede con un ciclo archivado hace más de 5 años y aún no depurado', () => {
      expect(canPurgeSchoolYear({ status: 'ARCHIVADO', archivedAt: old, purgedAt: null }, now)).toEqual({ ok: true });
    });

    it('no procede con un ciclo activo, ni archivado hace menos de 5 años, ni ya depurado', () => {
      expect(canPurgeSchoolYear({ status: 'ACTIVO', archivedAt: null, purgedAt: null }, now)).toEqual({ ok: false, reason: 'NO_ARCHIVADO' });
      expect(canPurgeSchoolYear({ status: 'ARCHIVADO', archivedAt: new Date('2024-01-01T00:00:00Z'), purgedAt: null }, now)).toEqual({ ok: false, reason: 'ANTES_DE_TIEMPO' });
      expect(canPurgeSchoolYear({ status: 'ARCHIVADO', archivedAt: old, purgedAt: new Date('2026-01-01T00:00:00Z') }, now)).toEqual({ ok: false, reason: 'YA_DEPURADO' });
    });

    it('un ciclo archivado sin fecha de archivo no se depura: no hay de dónde contar', () => {
      expect(canPurgeSchoolYear({ status: 'ARCHIVADO', archivedAt: null, purgedAt: null }, now)).toEqual({ ok: false, reason: 'NO_ARCHIVADO' });
    });
  });
});
