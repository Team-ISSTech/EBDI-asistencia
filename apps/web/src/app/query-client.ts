import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { forgetSession, SESSION_QUERY_KEY } from '../features/auth/use-session';
import { ApiClientError } from '../lib/api-client';

const HTTP_UNAUTHORIZED = 401;
const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 499;

const isClientError = (error: unknown): boolean =>
  error instanceof ApiClientError && error.status >= CLIENT_ERROR_MIN && error.status <= CLIENT_ERROR_MAX;

/**
 * Cliente de consultas de la aplicación. Un 401 en cualquier consulta o
 * mutación significa que la sesión caducó: se invalida en caché y los guards
 * mandan a iniciar sesión. Los errores 4xx no se reintentan.
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => expireSessionOn401(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => expireSessionOn401(client, error) }),
    defaultOptions: {
      // `navigator.onLine` no es de fiar (una red con portal cautivo se ve "en línea") y por defecto pausa todo
      // cuando dice que no hay red: aquí no, porque sin conexión justo se sirve la copia guardada o se encola la captura.
      queries: { networkMode: 'always', retry: (failureCount, error) => !isClientError(error) && failureCount < 1, refetchOnWindowFocus: false },
      mutations: { networkMode: 'always' },
    },
  });
  return client;
}

export function expireSessionOn401(client: QueryClient, error: unknown): void {
  if (error instanceof ApiClientError && error.status === HTTP_UNAUTHORIZED) {
    const previous = client.getQueryData<{ user: { id: number } } | null>(SESSION_QUERY_KEY);
    client.setQueryData(SESSION_QUERY_KEY, null);
    // La sesión ya no vale: no se deja una copia con la que abrir la aplicación ni datos de esa persona.
    void forgetSession(previous?.user.id ?? null);
  }
}
