import { describe, expect, it, vi } from 'vitest';
import { retryOnDeadlock } from '../database/retry-on-deadlock';

const deadlock = (): Error => Object.assign(new Error('Failed query'), { cause: Object.assign(new Error('Deadlock found'), { code: 'ER_LOCK_DEADLOCK' }) });

describe('retryOnDeadlock', () => {
  it('devuelve el resultado sin reintentar si no hay interbloqueo', async () => {
    const work = vi.fn().mockResolvedValue(7);
    expect(await retryOnDeadlock(work)).toBe(7);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('repite la transacción cuando MySQL elige a esta como víctima del interbloqueo', async () => {
    const work = vi.fn().mockRejectedValueOnce(deadlock()).mockRejectedValueOnce(deadlock()).mockResolvedValue('ok');
    expect(await retryOnDeadlock(work)).toBe('ok');
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('se rinde tras 3 intentos y devuelve el error original', async () => {
    const error = deadlock();
    const work = vi.fn().mockRejectedValue(error);
    await expect(retryOnDeadlock(work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('cualquier otro error se propaga de inmediato', async () => {
    const error = Object.assign(new Error('duplicado'), { cause: { code: 'ER_DUP_ENTRY' } });
    const work = vi.fn().mockRejectedValue(error);
    await expect(retryOnDeadlock(work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
