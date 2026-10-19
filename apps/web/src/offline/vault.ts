import type { OfflineDb } from './db';

const KEY_ID = 'main';
const IV_BYTES = 12;
const ALGORITHM = 'AES-GCM';

/**
 * Cifra lo que la tablet guarda para no perderlo sin conexión. La llave es
 * AES-GCM no extraíble y vive en IndexedDB: protege contra quien copie los
 * archivos del navegador o un respaldo del dispositivo, no contra código que corra
 * dentro de la propia aplicación (por eso nunca se guarda más de lo necesario).
 */
export class Vault {
  private key: Promise<CryptoKey> | null = null;

  constructor(private readonly db: OfflineDb) {}

  async seal(value: unknown): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const body = new TextEncoder().encode(JSON.stringify(value));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: ALGORITHM, iv }, await this.loadKey(), body));
    const out = new Uint8Array(IV_BYTES + cipher.length);
    out.set(iv, 0);
    out.set(cipher, IV_BYTES);
    return out;
  }

  /** El valor original, o `null` si el contenido está alterado o se cifró con otra llave. */
  async open<T>(sealed: Uint8Array): Promise<T | null> {
    try {
      const iv = sealed.slice(0, IV_BYTES);
      const plain = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, await this.loadKey(), sealed.slice(IV_BYTES));
      return JSON.parse(new TextDecoder().decode(plain)) as T;
    } catch {
      return null;
    }
  }

  private loadKey(): Promise<CryptoKey> {
    this.key ??= this.readOrCreateKey();
    return this.key;
  }

  private async readOrCreateKey(): Promise<CryptoKey> {
    const stored = await this.db.keys.get(KEY_ID);
    if (stored) return stored.key;
    const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: 256 }, false, ['encrypt', 'decrypt']);
    // Si dos pestañas crean la llave a la vez gana la primera; la otra usa esa.
    await this.db.transaction('rw', this.db.keys, async () => {
      if (!(await this.db.keys.get(KEY_ID))) await this.db.keys.add({ id: KEY_ID, key });
    });
    const winner = await this.db.keys.get(KEY_ID);
    return winner?.key ?? key;
  }
}
