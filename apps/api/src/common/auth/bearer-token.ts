import type { Request } from 'express';

const BEARER = /^Bearer\s+(\S+)$/i;

/** El token del encabezado `Authorization: Bearer <token>`, o `null` si falta o está mal formado. */
export const readBearerToken = (request: Request): string | null => {
  const header = request.headers?.authorization;
  const match = typeof header === 'string' ? BEARER.exec(header) : null;
  return match?.[1] ?? null;
};
