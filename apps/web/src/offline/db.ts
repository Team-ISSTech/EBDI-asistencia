import Dexie, { type Table } from 'dexie';
import type { SyncOperationType } from '@sirai/domain';

/**
 * PENDIENTE: por enviar (se reintenta solo). RECHAZADA y PARCIAL esperan a que una
 * persona las revise y reconcilie con el formato físico de respaldo (S-20); no se
 * reenvían solas ni se pierden.
 */
export type OutboxStatus = 'PENDIENTE' | 'RECHAZADA' | 'PARCIAL';

export interface OutboxFailure {
  readonly code: string | null;
  readonly message: string | null;
  /** Elementos que el servidor no aplicó: referencia numérica y motivo, nunca nombres. */
  readonly rejections: ReadonlyArray<{ readonly ref: number | null; readonly code: string; readonly message: string }>;
}

export interface OutboxRow {
  readonly operationId: string;
  readonly userId: number;
  readonly estanciaId: number;
  readonly type: SyncOperationType;
  /** Instante en que se capturó, no en el que se envía (ISO). */
  readonly capturedAt: string;
  /** El contenido de la operación (puede incluir notas de asesoría): solo existe cifrado. */
  readonly sealed: Uint8Array;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextRetryAt: number | null;
  readonly failure: OutboxFailure | null;
  readonly createdAt: number;
}

/** Lo consultado al servidor, para poder verlo sin conexión. Cifrado y por persona. */
export interface CacheRow {
  /** `${userId}:${nombre}`; la sesión usa `session`. */
  readonly key: string;
  readonly userId: number | null;
  readonly sealed: Uint8Array;
  readonly storedAt: number;
}

export interface KeyRow {
  readonly id: string;
  /** Llave AES-GCM no extraíble: su material no se puede leer desde JavaScript. */
  readonly key: CryptoKey;
}

/** Almacén local de la tablet (IndexedDB). Todo lo que contenga datos de menores va cifrado. */
export class OfflineDb extends Dexie {
  readonly outbox!: Table<OutboxRow, string>;
  readonly keys!: Table<KeyRow, string>;
  readonly cache!: Table<CacheRow, string>;

  constructor(name = 'sirai-offline') {
    super(name);
    this.version(1).stores({
      outbox: 'operationId, userId, status, createdAt, [userId+status]',
      keys: 'id',
    });
    // v2: lo consultado y la última sesión, para abrir la aplicación sin conexión.
    this.version(2).stores({ cache: 'key, userId, storedAt' });
  }
}
