import type { ApiEnv } from '@sirai/config';
import type { CookieOptions, Request, Response } from 'express';

export const SESSION_COOKIE = 'sirai_session';
const MS_PER_HOUR = 60 * 60 * 1000;

const baseOptions = (env: ApiEnv): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.COOKIE_SECURE,
  path: '/',
});

/**
 * La cookie vive el tope absoluto de la sesión; la expiración real (deslizante
 * por inactividad) la decide el servidor en cada petición.
 */
export const setSessionCookie = (response: Response, env: ApiEnv, token: string): void => {
  response.cookie(SESSION_COOKIE, token, { ...baseOptions(env), maxAge: env.SESSION_MAX_HOURS * MS_PER_HOUR });
};

export const clearSessionCookie = (response: Response, env: ApiEnv): void => {
  response.clearCookie(SESSION_COOKIE, baseOptions(env));
};

export const readSessionCookie = (request: Request): string | null => {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
};
