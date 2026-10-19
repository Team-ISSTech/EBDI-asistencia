import { OfflineDb } from './db';
import { Outbox } from './outbox';
import { ReadCache, SessionSnapshot } from './read-cache';
import { type SendOperations, SyncEngine } from './sync-engine';
import { sendOperations } from './sync-api';
import { Vault } from './vault';

export interface OfflineRuntime {
  readonly outbox: Outbox;
  readonly engine: SyncEngine;
  /** Lo consultado al servidor, para verlo sin conexión. */
  readonly cache: ReadCache;
  /** La última sesión, para abrir la aplicación sin conexión. */
  readonly snapshot: SessionSnapshot;
  /** Cierra y borra el almacén local (pruebas). */
  readonly destroy: () => Promise<void>;
}

/** Arma la cola local, el motor de envío y las copias de lectura sobre un almacén IndexedDB. */
export function createOfflineRuntime(options: { readonly dbName?: string; readonly send?: SendOperations } = {}): OfflineRuntime {
  const db = new OfflineDb(options.dbName);
  const vault = new Vault(db);
  const outbox = new Outbox(db, vault);
  return {
    outbox,
    engine: new SyncEngine(outbox, options.send ?? sendOperations),
    cache: new ReadCache(db, vault),
    snapshot: new SessionSnapshot(db, vault),
    destroy: () => db.delete(),
  };
}

let shared: OfflineRuntime | null = null;

/** La cola de esta tablet: una sola por navegador. */
export function sharedOfflineRuntime(): OfflineRuntime {
  shared ??= createOfflineRuntime();
  return shared;
}

/** Descarta la instancia compartida y su almacén (solo para pruebas: cada una empieza limpia). */
export async function resetSharedOfflineRuntime(): Promise<void> {
  const current = shared;
  shared = null;
  await current?.destroy().catch(() => undefined);
}
