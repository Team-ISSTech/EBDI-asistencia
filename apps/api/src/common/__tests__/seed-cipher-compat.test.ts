import type { ApiEnv } from '@sirai/config';
import { createSeedCipher } from '@sirai/db';
import { describe, expect, it } from 'vitest';
import { EncryptionService } from '../crypto/encryption.service';

const KEY = 'c'.repeat(64);

/** La semilla de demostración reproduce el formato de EncryptionService; si éste cambia, esta prueba lo delata. */
describe('cifrador de la semilla de demostración', () => {
  const seed = createSeedCipher(KEY);
  const service = new EncryptionService({ DATA_ENCRYPTION_KEY: KEY } as ApiEnv);

  it('la API descifra lo que cifra la semilla', () => {
    expect(service.decrypt(seed.encrypt('5500100001'))).toBe('5500100001');
    expect(service.decrypt(seed.encrypt('Dato de prueba: acentos y ñ'))).toBe('Dato de prueba: acentos y ñ');
  });

  it('el hash ciego de la semilla es el que la API usa para buscar por teléfono', () => {
    expect(seed.blindHash('5500100001').equals(service.blindHash('5500100001'))).toBe(true);
  });
});
