import { createCipheriv, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 1;
const IV_BYTES = 12;
const KEY_HEX_LENGTH = 64;

export interface SeedCipher {
  encrypt(plaintext: string): Buffer;
  blindHash(value: string): Buffer;
}

/**
 * Cifrador de la semilla de demostración. `packages/db` no puede importar `apps/api`, así que reproduce el formato
 * de `EncryptionService` ([versión 1 byte][iv 12][tag 16][texto], AAD = versión; hash ciego = HMAC-SHA256 con el
 * prefijo `blind-hash:`). Una prueba en `apps/api` comprueba que la API descifra lo que cifra esta función.
 */
export function createSeedCipher(keyHex: string): SeedCipher {
  if (!new RegExp(`^[0-9a-fA-F]{${KEY_HEX_LENGTH}}$`).test(keyHex)) {
    throw new Error('DATA_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales.');
  }
  const key = Buffer.from(keyHex, 'hex');
  return {
    encrypt(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      cipher.setAAD(Buffer.from([KEY_VERSION]));
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return Buffer.concat([Buffer.from([KEY_VERSION]), iv, cipher.getAuthTag(), encrypted]);
    },
    blindHash: (value) => createHmac('sha256', key).update(`blind-hash:${value}`).digest(),
  };
}
