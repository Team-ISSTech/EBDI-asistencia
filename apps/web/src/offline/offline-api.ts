import type { AttendanceStatus } from '@sirai/domain';
import { createContext, useContext } from 'react';
import type { EnqueueInput, OutboxCounts, ReviewItem } from './outbox';
import type { FlushOutcome } from './sync-engine';

/** Lo que captura la pantalla; el proveedor añade quién y en qué estancia. */
export type CaptureInput = EnqueueInput extends infer Input ? (Input extends unknown ? Omit<Input, 'userId' | 'estanciaId'> : never) : never;

export interface OfflineApi {
  readonly online: boolean;
  readonly counts: OutboxCounts;
  readonly syncing: boolean;
  /** Guarda la captura en la tablet y, si hay conexión, la envía enseguida. Devuelve el UUID de la operación. */
  readonly enqueue: (input: CaptureInput) => Promise<string>;
  /** Envía lo pendiente ahora, sin esperar el plazo entre reintentos. */
  readonly syncNow: () => Promise<FlushOutcome | null>;
  readonly review: () => Promise<ReviewItem[]>;
  readonly discard: (operationId: string) => Promise<boolean>;
  /** Lo marcado en una jornada que aún no llega al servidor, para seguir mostrándolo. */
  readonly pendingMarks: (journeyId: number) => Promise<ReadonlyMap<number, AttendanceStatus>>;
}

export const OfflineContext = createContext<OfflineApi | null>(null);

export function useOffline(): OfflineApi {
  const api = useContext(OfflineContext);
  if (!api) throw new Error('useOffline debe usarse dentro de OfflineProvider.');
  return api;
}

/** Como `useOffline`, pero devuelve `null` fuera del proveedor: para piezas de pantalla que son opcionales. */
export function useOfflineOptional(): OfflineApi | null {
  return useContext(OfflineContext);
}
