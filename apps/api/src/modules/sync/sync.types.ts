import type { SyncResult } from '@sirai/contracts';
import type { SyncResultStatus } from '@sirai/domain';

/** Acuse guardado de una operación ya procesada. */
export interface StoredOperation {
  readonly operationId: string;
  readonly userId: number;
  readonly estanciaId: number;
  readonly entity: string;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly status: SyncResultStatus;
  readonly payloadSha256: Buffer;
  readonly errorMessage: string | null;
  readonly response: SyncResult;
}
