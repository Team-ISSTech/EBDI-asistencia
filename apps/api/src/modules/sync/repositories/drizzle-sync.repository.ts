import { Inject, Injectable } from '@nestjs/common';
import { syncResultSchema } from '@sirai/contracts';
import { SYNC_RESULT_STATUSES } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module.js';
import type { StoredOperation } from '../sync.types.js';
import type { SyncRepository } from './sync.repository.js';

const { syncOperations } = schema;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';
const MAX_ERROR_LENGTH = 1000;

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

@Injectable()
export class DrizzleSyncRepository implements SyncRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(operationId: string): Promise<StoredOperation | null> {
    const [row] = await this.db.select().from(syncOperations).where(eq(syncOperations.operationId, operationId));
    if (!row?.payloadSha256) return null;
    const status = (SYNC_RESULT_STATUSES as readonly string[]).includes(row.status) ? (row.status as StoredOperation['status']) : 'RECHAZADA';
    return {
      operationId: row.operationId,
      userId: row.userId,
      estanciaId: row.estanciaId,
      entity: row.entity,
      capturedAt: row.capturedAt,
      receivedAt: row.receivedAt,
      status,
      payloadSha256: row.payloadSha256,
      errorMessage: row.errorMessage,
      response: syncResultSchema.parse(row.response),
    };
  }

  async save(operation: StoredOperation): Promise<boolean> {
    try {
      await this.db.insert(syncOperations).values({
        userId: operation.userId,
        estanciaId: operation.estanciaId,
        operationId: operation.operationId,
        entity: operation.entity,
        operation: 'REGISTRAR',
        capturedAt: operation.capturedAt,
        receivedAt: operation.receivedAt,
        status: operation.status,
        payloadSha256: operation.payloadSha256,
        errorMessage: operation.errorMessage?.slice(0, MAX_ERROR_LENGTH) ?? null,
        response: operation.response,
      });
      return true;
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) return false;
      throw error;
    }
  }
}
