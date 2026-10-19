import { describe, expect, it } from 'vitest';
import { mapLimit } from './concurrency';

describe('mapLimit', () => {
  it('devuelve los resultados en el orden de los elementos', async () => {
    const result = await mapLimit([30, 10, 20], 2, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay * 2;
    });
    expect(result).toEqual([60, 20, 40]);
  });

  it('nunca tiene más tareas en vuelo que el límite', async () => {
    let running = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 20 }, (_, index) => index), 4, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    });
    expect(peak).toBe(4);
  });

  it('con un límite mayor que los elementos los lanza todos', async () => {
    expect(await mapLimit([1, 2], 10, (value) => Promise.resolve(value + 1))).toEqual([2, 3]);
  });
});
