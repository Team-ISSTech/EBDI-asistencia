import { OfflineDb } from './db';
import { Outbox } from './outbox';
import { type SendOperations, SyncEngine } from './sync-engine';
import { sendOperations } from './sync-api';
import { Vault } from './vault';

export interface OfflineRuntime {
  readonly outbox: Outbox;
  readonly engine: SyncEngine;
}

/** Arma la cola local y su motor de envío sobre un almacén IndexedDB. */
export function createOfflineRuntime(options: { readonly dbName?: string; readonly send?: SendOperations } = {}): OfflineRuntime {
  const db = new OfflineDb(options.dbName);
  const outbox = new Outbox(db, new Vault(db));
  return { outbox, engine: new SyncEngine(outbox, options.send ?? sendOperations) };
}

let shared: OfflineRuntime | null = null;

/** La cola de esta tablet: una sola por navegador. */
export function sharedOfflineRuntime(): OfflineRuntime {
  shared ??= createOfflineRuntime();
  return shared;
}
