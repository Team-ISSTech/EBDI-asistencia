import type { Db } from '@sirai/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

const dbThat = (outcome: 'resolves' | 'rejects'): Db =>
  ({ execute: () => (outcome === 'resolves' ? Promise.resolve([]) : Promise.reject(new Error('down'))) }) as unknown as Db;

describe('HealthController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reporta db up cuando SELECT 1 responde', async () => {
    await expect(new HealthController(dbThat('resolves')).check()).resolves.toMatchObject({ status: 'ok', db: 'up' });
  });

  it('reporta db down sin lanzar cuando la consulta falla', async () => {
    await expect(new HealthController(dbThat('rejects')).check()).resolves.toMatchObject({ status: 'ok', db: 'down' });
  });

  it('reporta el tiempo activo del proceso en segundos enteros', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(42.9);
    await expect(new HealthController(dbThat('resolves')).check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      uptimeSeconds: 42,
    });
  });
});
