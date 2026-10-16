import { describe, expect, it } from 'vitest';
import { exportQuerySchema } from '../reports/export.js';

describe('exportQuerySchema (RF-17)', () => {
  it('acepta los tres cortes y los dos formatos', () => {
    for (const period of ['DAY', 'MONTH', 'QUARTER']) {
      for (const format of ['xlsx', 'pdf']) {
        expect(exportQuerySchema.safeParse({ period, date: '2026-10-15', format }).success).toBe(true);
      }
    }
  });

  it('rechaza cortes, formatos y fechas que no existen', () => {
    expect(exportQuerySchema.safeParse({ period: 'YEAR', date: '2026-10-15', format: 'pdf' }).success).toBe(false);
    expect(exportQuerySchema.safeParse({ period: 'DAY', date: '2026-10-15', format: 'csv' }).success).toBe(false);
    expect(exportQuerySchema.safeParse({ period: 'DAY', date: '15/10/2026', format: 'pdf' }).success).toBe(false);
    expect(exportQuerySchema.safeParse({ period: 'DAY', date: '2026-10-15' }).success).toBe(false);
  });
});
