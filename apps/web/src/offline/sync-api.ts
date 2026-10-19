import { type SyncOperation, type SyncResponse, syncResponseSchema } from '@sirai/contracts';
import { apiRequest } from '../lib/api-client';

/** Con una conexión débil es mejor reintentar luego que dejar la petición colgada. */
const SYNC_TIMEOUT_MS = 20_000;

export const sendOperations = (operations: SyncOperation[]): Promise<SyncResponse> =>
  apiRequest('/sincronizacion', { method: 'POST', body: { operations }, schema: syncResponseSchema, timeoutMs: SYNC_TIMEOUT_MS });
