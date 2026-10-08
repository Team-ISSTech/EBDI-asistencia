import type { SessionResponse } from '@sirai/contracts';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../lib/api-client';
import { fetchSession, login, logout, switchEstancia } from './api';

export const SESSION_QUERY_KEY = ['session'] as const;

/** `null` significa "sin sesión"; evita que un 401 se trate como error. */
export const fetchSessionOrNull = async (): Promise<SessionResponse | null> => {
  try {
    return await fetchSession();
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
};

export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSessionOrNull, staleTime: 60_000, retry: false });
}

/**
 * Las tabletas se comparten en las estancias: al cambiar de persona o de
 * estancia se descarta todo lo cacheado salvo la sesión nueva.
 */
const replaceSession = (client: QueryClient, session: SessionResponse | null): void => {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0] });
  client.setQueryData(SESSION_QUERY_KEY, session);
};

/** Mutaciones de sesión; cada una deja la caché coherente con el servidor. */
export function useSessionActions() {
  const client = useQueryClient();
  return {
    login: useMutation({ mutationFn: login, onSuccess: (session) => replaceSession(client, session) }),
    logout: useMutation({ mutationFn: logout, onSuccess: () => replaceSession(client, null) }),
    switchEstancia: useMutation({ mutationFn: switchEstancia, onSuccess: (session) => replaceSession(client, session) }),
  };
}
