import { describe, expect, it } from 'vitest';
import { openSchoolYearRequestSchema, purgeSchoolYearRequestSchema, purgeSchoolYearResponseSchema, schoolYearListResponseSchema, schoolYearSchema } from '../school-years/school-year.js';

describe('openSchoolYearRequestSchema (RNF-05)', () => {
  const valid = { code: '2026-2027', startDate: '2026-08-24', endDate: '2027-07-16' };

  it('pide clave, inicio y fin', () => {
    expect(openSchoolYearRequestSchema.safeParse(valid).success).toBe(true);
    expect(openSchoolYearRequestSchema.safeParse({ ...valid, code: '' }).success).toBe(false);
    expect(openSchoolYearRequestSchema.safeParse({ code: '2026-2027' }).success).toBe(false);
  });

  it('rechaza fechas inválidas o un fin anterior al inicio, y claves con espacios o demasiado largas', () => {
    expect(openSchoolYearRequestSchema.safeParse({ ...valid, startDate: 'agosto' }).success).toBe(false);
    expect(openSchoolYearRequestSchema.safeParse({ ...valid, endDate: '2026-08-01' }).success).toBe(false);
    expect(openSchoolYearRequestSchema.safeParse({ ...valid, code: '2026 2027' }).success).toBe(false);
    expect(openSchoolYearRequestSchema.safeParse({ ...valid, code: 'x'.repeat(21) }).success).toBe(false);
  });

  it('un ciclo de un solo día es válido', () => {
    expect(openSchoolYearRequestSchema.safeParse({ code: 'UNO', startDate: '2026-08-24', endDate: '2026-08-24' }).success).toBe(true);
  });
});

describe('depuración (RNF-05)', () => {
  it('la confirmación es la clave del ciclo, escrita', () => {
    expect(purgeSchoolYearRequestSchema.safeParse({ confirmCode: '2020-2021' }).success).toBe(true);
    expect(purgeSchoolYearRequestSchema.safeParse({ confirmCode: '' }).success).toBe(false);
    expect(purgeSchoolYearRequestSchema.safeParse({}).success).toBe(false);
  });

  it('la respuesta dice cuánto se vació', () => {
    expect(purgeSchoolYearResponseSchema.safeParse({ contacts: 3, releases: 1 }).success).toBe(true);
    expect(purgeSchoolYearResponseSchema.safeParse({ contacts: -1, releases: 0 }).success).toBe(false);
  });
});

describe('schoolYearSchema', () => {
  const base = { id: 1, code: '2025-2026', startDate: '2025-08-25', endDate: '2026-07-15', status: 'ARCHIVADO', archivedAt: '2026-07-16T10:00:00.000Z', purgeEligibleOn: '2031-07-16T10:00:00.000Z', purgedAt: null, canPurge: false, usage: null };

  it('describe un ciclo archivado, con desde cuándo se puede depurar', () => {
    expect(schoolYearSchema.safeParse(base).success).toBe(true);
    expect(schoolYearListResponseSchema.safeParse({ schoolYears: [base] }).success).toBe(true);
  });

  it('el ciclo activo lleva lo que impide cerrarlo y no tiene fechas de archivo', () => {
    const active = { ...base, status: 'ACTIVO', archivedAt: null, purgeEligibleOn: null, usage: { openJourneys: 2, openFollowUps: 1 } };
    expect(schoolYearSchema.safeParse(active).success).toBe(true);
  });

  it('no admite estados inventados', () => {
    expect(schoolYearSchema.safeParse({ ...base, status: 'BORRADO' }).success).toBe(false);
  });
});
