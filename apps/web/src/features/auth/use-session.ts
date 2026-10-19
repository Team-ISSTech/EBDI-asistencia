import { type SessionResponse, sessionResponseSchema } from '@sirai/contracts';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../lib/api-client';
import { sharedOfflineRuntime } from '../../offline/runtime';
import { isConnectionFailure } from '../../offline/save-or-queue';
import { changePassword, fetchSession, login, logout, switchEstancia } from './api';

export const SESSION_QUERY_KEY = ['session'] as const;

/** La copia local es una comodidad: si el almacén no funciona (modo privado, sin espacio) la aplicación sigue igual. */
const ignoreStorageFailure = (): void => undefined;

/** Guarda (cifrada) la última sesión conocida para poder abrir la aplicación sin conexión. */
export const rememberSession = (session: SessionResponse): void => {
  void sharedOfflineRuntime().snapshot.save(session).catch(ignoreStorageFailure);
};

/** Borra la copia de la sesión y lo consultado por esa persona; la cola de capturas pendientes no se toca. */
export const forgetSession = async (userId: number | null): Promise<void> => {
  const runtime = sharedOfflineRuntime();
  await runtime.snapshot.clear().catch(ignoreStorageFailure);
  if (userId !== null) await runtime.cache.clearUser(userId).catch(ignoreStorageFailure);
};

const loadSnapshot = async (): Promise<SessionResponse | null> => {
  const stored = await sharedOfflineRuntime().snapshot.load().catch(() => null);
  const parsed = sessionResponseSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
};

/**
 * `null` significa "sin sesión"; evita que un 401 se trate como error. Sin conexión (o con el servidor
 * caído) se usa la última sesión conocida para abrir la aplicación; el servidor sigue siendo quien valida cada petición.
 */
export const fetchSessionOrNull = async (): Promise<SessionResponse | null> => {
  try {
    const session = await fetchSession();
    rememberSession(session);
    return session;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      await forgetSession(null);
      return null;
    }
    const snapshot = isConnectionFailure(error) ? await loadSnapshot() : null;
    if (snapshot) return snapshot;
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
  if (session) rememberSession(session);
};

/** Mutaciones de sesión; cada una deja la caché coherente con el servidor. */
export function useSessionActions() {
  const client = useQueryClient();
  return {
    login: useMutation({ mutationFn: login, onSuccess: (session) => replaceSession(client, session) }),
    logout: useMutation({
      mutationFn: logout,
      onSuccess: async () => {
        const previous = client.getQueryData<SessionResponse | null>(SESSION_QUERY_KEY);
        // Primero se borra lo local; la sesión se retira al final, porque en cuanto desaparece la pantalla se desmonta.
        await forgetSession(previous?.user.id ?? null);
        replaceSession(client, null);
      },
    }),
    /** La sesión sigue siendo la misma: solo cambia la marca de contraseña temporal, así que el resto de la caché se conserva. */
    changePassword: useMutation({ mutationFn: changePassword, onSuccess: (session) => client.setQueryData(SESSION_QUERY_KEY, session) }),
    switchEstancia: useMutation({ mutationFn: switchEstancia, onSuccess: (session) => replaceSession(client, session) }),
  };
}
