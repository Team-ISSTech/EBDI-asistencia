import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { SESSION_QUERY_KEY, useSession } from '../features/auth/use-session';
import { type CaptureInput, OfflineContext, type OfflineApi } from './offline-api';
import type { EnqueueInput, OutboxCounts } from './outbox';
import { type OfflineRuntime, sharedOfflineRuntime } from './runtime';
import type { FlushOutcome } from './sync-engine';
import { useOnlineStatus } from './use-online-status';

const DEFAULT_POLL_MS = 30_000;
const NOTHING: OutboxCounts = { pending: 0, review: 0, others: 0 };
const COUNTS_KEY = ['offline', 'counts'] as const;

export interface OfflineProviderProps {
  readonly children: ReactNode;
  readonly runtime?: OfflineRuntime;
  /** Cada cuánto se intenta enviar lo pendiente mientras la pantalla está abierta. */
  readonly pollMs?: number;
}

/**
 * Mantiene viva la cola de capturas sin conexión (RF-20 a RF-23): guarda lo que se
 * captura, lo envía solo al reconectar y cada cierto tiempo, y avisa qué hay
 * pendiente o por revisar. Solo envía lo de la persona con sesión.
 */
export function OfflineProvider({ children, runtime = sharedOfflineRuntime(), pollMs = DEFAULT_POLL_MS }: OfflineProviderProps) {
  const client = useQueryClient();
  const { data: session } = useSession();
  const online = useOnlineStatus();
  const userId = session?.user.id ?? null;
  const estanciaId = session?.activeEstancia?.id ?? null;
  const { outbox, engine } = runtime;

  const counts = useQuery({
    queryKey: [...COUNTS_KEY, userId],
    queryFn: () => (userId === null ? Promise.resolve(NOTHING) : outbox.counts(userId)),
    // La cola vive en la tablet: no hay nada que "refrescar" desde el servidor.
    staleTime: Infinity,
  });
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: COUNTS_KEY }), [client]);

  const sync = useMutation({
    mutationFn: async (force: boolean): Promise<FlushOutcome | null> => {
      if (userId === null || !navigator.onLine) return null;
      const outcome = await engine.flush(userId, { force });
      await refresh();
      if (outcome.applied > 0 || outcome.review > 0) void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0] && query.queryKey[0] !== COUNTS_KEY[0] });
      if (outcome.stopped === 'SESSION') client.setQueryData(SESSION_QUERY_KEY, null);
      return outcome;
    },
  });
  const { mutate: flush, mutateAsync: flushNow } = sync;

  useEffect(() => {
    flush(false);
  }, [flush, userId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush(false);
    };
    const onOnline = () => flush(false);
    const timer = setInterval(() => flush(false), pollMs);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flush, pollMs]);

  const enqueue = useCallback(
    async (input: CaptureInput): Promise<string> => {
      if (userId === null || estanciaId === null) throw new Error('No hay sesión con estancia activa para guardar la captura.');
      const operationId = await outbox.enqueue({ ...input, userId, estanciaId } as EnqueueInput);
      await refresh();
      flush(false);
      return operationId;
    },
    [estanciaId, flush, outbox, refresh, userId],
  );

  const api = useMemo<OfflineApi>(
    () => ({
      online,
      counts: counts.data ?? NOTHING,
      syncing: sync.isPending,
      enqueue,
      syncNow: () => flushNow(true),
      review: async () => (userId === null ? [] : outbox.review(userId)),
      pendingMarks: async (journeyId) => (userId === null ? new Map() : outbox.pendingMarks(userId, journeyId)),
      discard: async (operationId) => {
        const removed = userId !== null && (await outbox.discard(userId, operationId));
        await refresh();
        return removed;
      },
    }),
    [counts.data, enqueue, flushNow, online, outbox, refresh, sync.isPending, userId],
  );

  return <OfflineContext.Provider value={api}>{children}</OfflineContext.Provider>;
}
