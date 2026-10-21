import { describe, expect, it } from 'vitest';
import { createSeedCipher } from '../seed/demo-cipher.js';
import { assertDemoAllowed } from '../seed/demo.js';

const KEY = 'ab'.repeat(32);

describe('createSeedCipher', () => {
  const cipher = createSeedCipher(KEY);

  it('produce [versión][iv 12][tag 16][texto] y no deja el texto en claro', () => {
    const blob = cipher.encrypt('5500100001');
    expect(blob[0]).toBe(1);
    expect(blob).toHaveLength(1 + 12 + 16 + '5500100001'.length);
    expect(blob.toString('utf8')).not.toContain('5500100001');
  });

  it('el mismo texto da blobs distintos (iv aleatorio) pero el hash ciego es estable', () => {
    expect(cipher.encrypt('x').equals(cipher.encrypt('x'))).toBe(false);
    expect(cipher.blindHash('5500100001').equals(cipher.blindHash('5500100001'))).toBe(true);
    expect(cipher.blindHash('5500100001')).toHaveLength(32);
  });

  it.each(['', 'zz'.repeat(32), 'ab'.repeat(31)])('rechaza una llave que no son 64 caracteres hexadecimales (%j)', (key) => {
    expect(() => createSeedCipher(key)).toThrow(/64 caracteres hexadecimales/);
  });
});

describe('assertDemoAllowed', () => {
  it('se niega en producción y permite desarrollo y pruebas', () => {
    expect(() => assertDemoAllowed({ NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => assertDemoAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertDemoAllowed({})).not.toThrow();
  });
});
