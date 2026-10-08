import type { Db } from '@sirai/db';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

const dbThat = (outcome: 'resolves' | 'rejects'): Db =>
  ({ execute: () => (outcome === 'resolves' ? Promise.resolve([]) : Promise.reject(new Error('down'))) }) as unknown as Db;

describe('HealthController', () => {
  it('reporta db up cuando SELECT 1 responde', async () => {
    await expect(new HealthController(dbThat('resolves')).check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('reporta db down sin lanzar cuando la consulta falla', async () => {
    await expect(new HealthController(dbThat('rejects')).check()).resolves.toEqual({ status: 'ok', db: 'down' });
  });
});
