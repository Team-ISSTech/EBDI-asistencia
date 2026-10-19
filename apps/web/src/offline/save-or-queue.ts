import { isTransientFailure } from '@sirai/domain';
import { ApiClientError } from '../lib/api-client';

const HTTP_UNAUTHORIZED = 401;

/**
 * ¿Hay que guardar la captura en la tablet en vez de perderla? Sí cuando no se supo
 * si llegó (sin red, tiempo agotado, respuesta ilegible), cuando el servidor falló, o
 * cuando la sesión venció a media captura. No cuando el servidor la rechazó a propósito
 * (datos inválidos, sin permiso, jornada cerrada…): eso se muestra y se corrige.
 */
export function shouldQueue(error: unknown): boolean {
  if (!(error instanceof ApiClientError) || error.code === 'RESPUESTA_INVALIDA') return true;
  return error.status === HTTP_UNAUTHORIZED || isTransientFailure(error.status);
}

export type SaveResult<T> = { readonly queued: false; readonly value: T } | { readonly queued: true };

/**
 * Intenta guardar en el servidor y, si no se pudo por la conexión, en la cola de la tablet.
 * Todas las operaciones llevan identificadores propios, así que reintentar lo que quizá sí
 * llegó nunca duplica el efecto. Sin `queue` (sin cola local) se comporta como siempre.
 */
export async function saveOrQueue<T>(attempt: () => Promise<T>, queue: (() => Promise<string>) | null): Promise<SaveResult<T>> {
  try {
    return { queued: false, value: await attempt() };
  } catch (error) {
    if (queue === null || !shouldQueue(error)) throw error;
    await queue();
    return { queued: true };
  }
}
