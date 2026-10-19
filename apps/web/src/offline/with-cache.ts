import type { OfflineApi } from './offline-api';

/** Consulta con copia local cuando existe la cola sin conexión; sin ella (pruebas, componentes sueltos) es una consulta normal. */
export const withCache = <T>(offline: OfflineApi | null, name: string, load: () => Promise<T>): Promise<T> => (offline ? offline.cached(name, load) : load());
