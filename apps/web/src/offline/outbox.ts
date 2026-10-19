import { type SyncOperation, syncOperationSchema } from '@sirai/contracts';
import { type AttendanceStatus, nextRetryDelayMs } from '@sirai/domain';
import type { OfflineDb, OutboxFailure, OutboxRow, OutboxStatus } from './db';
import type { Vault } from './vault';

type OperationOf<T extends SyncOperation['type']> = Extract<SyncOperation, { type: T }>;

/** Lo que se encola: quién captura, en qué estancia y el contenido de la operación. */
export type EnqueueInput = { readonly userId: number; readonly estanciaId: number; readonly capturedAt?: Date } & (
  | { readonly type: 'ATTENDANCE_MARKS'; readonly payload: OperationOf<'ATTENDANCE_MARKS'>['payload'] }
  | { readonly type: 'FOLLOW_UP_CONTACT'; readonly payload: OperationOf<'FOLLOW_UP_CONTACT'>['payload'] }
);

export interface ReviewItem {
  readonly operationId: string;
  readonly type: SyncOperation['type'];
  readonly status: Exclude<OutboxStatus, 'PENDIENTE'>;
  readonly capturedAt: string;
  readonly failure: OutboxFailure | null;
  /** Lo capturado, para reconciliarlo con el formato físico; nulo si ya no se puede leer. */
  readonly payload: SyncOperation['payload'] | null;
}

export interface OutboxCounts {
  readonly pending: number;
  readonly review: number;
  /** Capturas de otras personas en esta misma tablet: se envían cuando ellas inicien sesión. */
  readonly others: number;
}

const UNREADABLE: OutboxFailure = { code: 'ILEGIBLE', message: 'Esta captura ya no se puede leer en la tablet. Reconcíliala con el formato físico de respaldo.', rejections: [] };

/**
 * Cola de operaciones capturadas sin conexión (RF-20 a RF-23). El contenido solo
 * existe cifrado; cada operación pertenece a quien la capturó y solo se envía con la
 * sesión de esa persona. Nada sale de aquí sin que el servidor confirme: una
 * operación se conserva hasta que se aplica, o hasta que alguien revisa por qué se rechazó.
 */
export class Outbox {
  constructor(
    private readonly db: OfflineDb,
    private readonly vault: Vault,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async enqueue(input: EnqueueInput): Promise<string> {
    const operationId = crypto.randomUUID();
    await this.db.outbox.add({
      operationId,
      userId: input.userId,
      estanciaId: input.estanciaId,
      type: input.type,
      capturedAt: (input.capturedAt ?? new Date(this.now())).toISOString(),
      sealed: await this.vault.seal(input.payload),
      status: 'PENDIENTE',
      attempts: 0,
      nextRetryAt: null,
      failure: null,
      createdAt: this.now(),
    });
    return operationId;
  }

  /** Lo que toca enviar de esta persona, en el orden en que se capturó. Lo ilegible se aparta para revisión. */
  async due(userId: number, at: number, force = false): Promise<SyncOperation[]> {
    const rows = (await this.db.outbox.where('[userId+status]').equals([userId, 'PENDIENTE']).toArray())
      .filter((row) => force || row.nextRetryAt === null || row.nextRetryAt <= at)
      .sort((a, b) => a.createdAt - b.createdAt);
    const operations: SyncOperation[] = [];
    for (const row of rows) {
      const operation = await this.toOperation(row);
      if (operation) operations.push(operation);
      else await this.markForReview(row.operationId, 'RECHAZADA', UNREADABLE);
    }
    return operations;
  }

  async complete(operationId: string): Promise<void> {
    await this.db.outbox.delete(operationId);
  }

  async markForReview(operationId: string, status: Exclude<OutboxStatus, 'PENDIENTE'>, failure: OutboxFailure): Promise<void> {
    await this.patch(operationId, () => ({ status, failure, nextRetryAt: null }));
  }

  /** El envío falló por la red o el servidor: se reintenta con una espera que crece. */
  async scheduleRetry(operationIds: readonly string[]): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      for (const id of operationIds) {
        await this.patch(id, (row) => ({ attempts: row.attempts + 1, nextRetryAt: this.now() + nextRetryDelayMs(row.attempts + 1) }));
      }
    });
  }

  async review(userId: number): Promise<ReviewItem[]> {
    const rows = (await this.db.outbox.where('userId').equals(userId).toArray()).filter((row) => row.status !== 'PENDIENTE').sort((a, b) => a.createdAt - b.createdAt);
    return Promise.all(rows.map(async (row) => ({ operationId: row.operationId, type: row.type, status: row.status as ReviewItem['status'], capturedAt: row.capturedAt, failure: row.failure, payload: (await this.toOperation(row))?.payload ?? null })));
  }

  /** Quita una captura ya revisada. Solo la de esa persona y solo si estaba en revisión: lo pendiente no se descarta. */
  async discard(userId: number, operationId: string): Promise<boolean> {
    const row = await this.db.outbox.get(operationId);
    if (!row || row.userId !== userId || row.status === 'PENDIENTE') return false;
    await this.db.outbox.delete(operationId);
    return true;
  }

  /**
   * Lo último que esta persona capturó para cada infante de una jornada y aún no llega al servidor.
   * Sirve para seguir mostrando lo marcado mientras se espera la conexión.
   */
  async pendingMarks(userId: number, journeyId: number): Promise<Map<number, AttendanceStatus>> {
    const marks = new Map<number, AttendanceStatus>();
    for (const operation of await this.due(userId, this.now(), true)) {
      if (operation.type !== 'ATTENDANCE_MARKS' || operation.payload.journeyId !== journeyId) continue;
      for (const mark of operation.payload.marks) marks.set(mark.enrollmentId, mark.status);
    }
    return marks;
  }

  async counts(userId: number): Promise<OutboxCounts> {
    const rows = await this.db.outbox.toArray();
    const mine = rows.filter((row) => row.userId === userId);
    return { pending: mine.filter((row) => row.status === 'PENDIENTE').length, review: mine.filter((row) => row.status !== 'PENDIENTE').length, others: rows.length - mine.length };
  }

  /**
   * Cambia campos de una fila reemplazándola entera: `update` de Dexie clona los valores y
   * no conserva bien el contenido cifrado (`Uint8Array`).
   */
  private async patch(operationId: string, changes: (row: OutboxRow) => Partial<OutboxRow>): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      const row = await this.db.outbox.get(operationId);
      if (row) await this.db.outbox.put({ ...row, ...changes(row) });
    });
  }

  private async toOperation(row: OutboxRow): Promise<SyncOperation | null> {
    const payload = await this.vault.open<unknown>(row.sealed);
    if (payload === null) return null;
    const parsed = syncOperationSchema.safeParse({ operationId: row.operationId, type: row.type, capturedAt: row.capturedAt, payload });
    return parsed.success ? parsed.data : null;
  }
}
