import { apiErrorSchema } from '@sirai/contracts';
import type { ZodType } from 'zod';
import { API_URL } from './env';

/** Error de la API con código estable; la UI decide el mensaje por `code`. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface RequestOptions<T> {
  readonly method?: 'GET' | 'POST' | 'PATCH';
  readonly body?: unknown;
  /** Esquema de `@sirai/contracts` que valida la respuesta; `undefined` para 204. */
  readonly schema?: ZodType<T>;
}

const parseError = async (response: Response): Promise<ApiClientError> => {
  const fallback = new ApiClientError(response.status, 'ERROR_INTERNO', 'No se pudo completar la operación.');
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? new ApiClientError(response.status, parsed.data.error.code, parsed.data.error.message) : fallback;
};

/**
 * Único punto de `fetch` de la aplicación: cookies incluidas, JSON y
 * validación de la respuesta con el contrato. Ningún componente llama a
 * `fetch` directamente.
 */
export async function apiRequest<T = undefined>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) throw await parseError(response);
  if (!options.schema) return undefined as T;
  const parsed = options.schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiClientError(response.status, 'RESPUESTA_INVALIDA', 'La respuesta del servidor no tiene el formato esperado.');
  return parsed.data;
}
