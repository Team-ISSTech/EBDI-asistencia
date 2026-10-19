import type { SyncOperation, SyncResponse } from '@sirai/contracts';
import { isTransientFailure } from '@sirai/domain';
import { ApiClientError } from '../lib/api-client';
import type { Outbox } from './outbox';

/** Lote máximo que acepta `POST /sincronizacion`. */
const BATCH_SIZE = 50;
const HTTP_UNAUTHORIZED = 401;

export type SendOperations = (operations: SyncOperation[]) => Promise<SyncResponse>;

export interface FlushOptions {
  /** Ignora la espera de los reintentos (por ejemplo "Enviar ahora"). */
  readonly force?: boolean;
}

export interface FlushOutcome {
  readonly sent: number;
  readonly applied: number;
  /** Operaciones que el servidor rechazó, total o parcialmente, y esperan revisión. */
  readonly review: number;
  /** Por qué se detuvo antes de vaciar la cola: la red o el servidor, o la sesión. */
  readonly stopped: 'NETWORK' | 'SESSION' | null;
}

type Failure = { readonly kind: 'SESSION' } | { readonly kind: 'NETWORK' } | { readonly kind: 'REJECTED'; readonly code: string; readonly message: string };

/** Sin estado HTTP (red caída, tiempo agotado, respuesta ilegible) o error del servidor: pasajero. */
const classify = (error: unknown): Failure => {
  if (!(error instanceof ApiClientError) || error.code === 'RESPUESTA_INVALIDA') return { kind: 'NETWORK' };
  if (error.status === HTTP_UNAUTHORIZED) return { kind: 'SESSION' };
  return isTransientFailure(error.status) ? { kind: 'NETWORK' } : { kind: 'REJECTED', code: error.code, message: error.message };
};

/**
 * Envía la cola al servidor (RF-21 a RF-23). Las operaciones llevan su UUID, así que
 * un reintento nunca duplica el efecto. Una falla de red o del servidor deja todo
 * en su lugar para reintentar con espera creciente; un rechazo no se descarta: queda
 * para que una persona lo revise y lo reconcilie con el formato físico (S-20).
 */
export class SyncEngine {
  private running: Promise<FlushOutcome> | null = null;

  constructor(
    private readonly outbox: Outbox,
    private readonly send: SendOperations,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Un solo envío a la vez: si ya hay uno en curso, se espera a ese. */
  flush(userId: number, options: FlushOptions = {}): Promise<FlushOutcome> {
    this.running ??= this.drain(userId, options.force === true).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(userId: number, force: boolean): Promise<FlushOutcome> {
    const totals = { sent: 0, applied: 0, review: 0 };
    for (;;) {
      const batch = (await this.outbox.due(userId, this.now(), force)).slice(0, BATCH_SIZE);
      if (batch.length === 0) return { ...totals, stopped: null };
      totals.sent += batch.length;
      const outcome = await this.sendBatch(batch);
      totals.applied += outcome.applied;
      totals.review += outcome.review;
      if (outcome.stopped) return { ...totals, stopped: outcome.stopped };
    }
  }

  private async sendBatch(batch: readonly SyncOperation[]): Promise<{ applied: number; review: number; stopped: FlushOutcome['stopped'] }> {
    let response: SyncResponse;
    try {
      response = await this.send([...batch]);
    } catch (error) {
      return this.onFailure(batch, classify(error));
    }
    return { ...(await this.apply(batch, response)), stopped: null };
  }

  private async onFailure(batch: readonly SyncOperation[], failure: Failure): Promise<{ applied: number; review: number; stopped: FlushOutcome['stopped'] }> {
    if (failure.kind === 'SESSION') return { applied: 0, review: 0, stopped: 'SESSION' };
    if (failure.kind === 'NETWORK') {
      await this.outbox.scheduleRetry(batch.map((operation) => operation.operationId));
      return { applied: 0, review: 0, stopped: 'NETWORK' };
    }
    for (const operation of batch) await this.outbox.markForReview(operation.operationId, 'RECHAZADA', { code: failure.code, message: failure.message, rejections: [] });
    return { applied: 0, review: batch.length, stopped: null };
  }

  private async apply(batch: readonly SyncOperation[], response: SyncResponse): Promise<{ applied: number; review: number }> {
    const byId = new Map(response.results.map((result) => [result.operationId, result]));
    let applied = 0;
    let review = 0;
    const unanswered: string[] = [];
    for (const { operationId } of batch) {
      const result = byId.get(operationId);
      if (!result) unanswered.push(operationId);
      else if (result.status === 'APLICADA') {
        await this.outbox.complete(operationId);
        applied += 1;
      } else {
        await this.outbox.markForReview(operationId, result.status === 'PARCIAL' ? 'PARCIAL' : 'RECHAZADA', { code: result.code, message: result.message, rejections: result.rejections });
        review += 1;
      }
    }
    if (unanswered.length > 0) await this.outbox.scheduleRetry(unanswered);
    return { applied, review };
  }
}
