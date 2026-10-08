import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { SESSION_QUERY_KEY } from '../features/auth/use-session';
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
      queries: { retry: (failureCount, error) => !isClientError(error) && failureCount < 1, refetchOnWindowFocus: false },
    },
  });
  return client;
}

export function expireSessionOn401(client: QueryClient, error: unknown): void {
  if (error instanceof ApiClientError && error.status === HTTP_UNAUTHORIZED) {
    client.setQueryData(SESSION_QUERY_KEY, null);
  }
}
