import type { SessionResponse } from '@sirai/contracts';

const APP_ROOT = '/app';

/**
 * Solo se vuelve a rutas internas de la aplicación. `//host` o una URL
 * absoluta se descartan: evita un redireccionamiento abierto si alguien
 * llegara a escribir ese estado de navegación.
 */
export const safeInternalPath = (candidate: string | undefined): string | null =>
  candidate !== undefined && candidate.startsWith(`${APP_ROOT}/`) && !candidate.startsWith('//') ? candidate : null;

/**
 * Único lugar que decide a dónde ir tras iniciar sesión: si hay estancia
 * activa o ninguna disponible, a la app (o al destino pendiente); si hay
 * estancias por elegir, al selector.
 */
export function postLoginPath(session: SessionResponse, from: string | undefined): string {
  if (session.activeEstancia === null && session.availableEstancias.length > 0) return '/seleccionar-estancia';
  return safeInternalPath(from) ?? APP_ROOT;
}
