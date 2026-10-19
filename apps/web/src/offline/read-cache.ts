import type { OfflineDb } from './db';
import type { Vault } from './vault';

const SESSION_KEY = 'session';

/**
 * Copia cifrada de lo que se consultó, para poder verlo cuando no hay conexión. Es por persona: lo
 * de una no se muestra a otra que use la misma tablet. Se borra al cerrar sesión y lo viejo se depura.
 */
export class ReadCache {
  constructor(
    private readonly db: OfflineDb,
    private readonly vault: Vault,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async put(userId: number, name: string, value: unknown): Promise<void> {
    await this.db.cache.put({ key: `${userId}:${name}`, userId, sealed: await this.vault.seal({ value }), storedAt: this.now() });
  }

  async get<T>(userId: number, name: string): Promise<{ readonly value: T; readonly storedAt: number } | null> {
    const row = await this.db.cache.get(`${userId}:${name}`);
    if (!row) return null;
    const opened = await this.vault.open<{ value: T }>(row.sealed);
    return opened === null ? null : { value: opened.value, storedAt: row.storedAt };
  }

  async clearUser(userId: number): Promise<void> {
    await this.db.cache.where('userId').equals(userId).delete();
  }

  async purgeOlderThan(maxAgeMs: number): Promise<void> {
    await this.db.cache.where('storedAt').below(this.now() - maxAgeMs).delete();
  }
}

/**
 * Última sesión conocida, cifrada: permite abrir la aplicación sin conexión. No concede nada: cada
 * petición al servidor sigue exigiendo su cookie, y al cerrar sesión se borra.
 */
export class SessionSnapshot {
  constructor(
    private readonly db: OfflineDb,
    private readonly vault: Vault,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async save(session: unknown): Promise<void> {
    await this.db.cache.put({ key: SESSION_KEY, userId: null, sealed: await this.vault.seal({ session }), storedAt: this.now() });
  }

  async load(): Promise<unknown> {
    const row = await this.db.cache.get(SESSION_KEY);
    return row ? ((await this.vault.open<{ session: unknown }>(row.sealed))?.session ?? null) : null;
  }

  async clear(): Promise<void> {
    await this.db.cache.delete(SESSION_KEY);
  }
}
