import type { StoredOperation } from '../sync.types.js';

export interface SyncRepository {
  find(operationId: string): Promise<StoredOperation | null>;
  /** Guarda el acuse. Devuelve false si otra petición ya lo guardó (carrera entre reintentos). */
  save(operation: StoredOperation): Promise<boolean>;
}

export const SYNC_REPOSITORY = Symbol('SYNC_REPOSITORY');
