import type { NextFunction, Request, Response } from 'express';

const HSTS_MAX_AGE_SECONDS = 31_536_000;

export interface SecurityHeadersOptions {
  /** Solo con HTTPS: un navegador que recibe HSTS por HTTP plano lo ignora, pero no debe anunciarse. */
  readonly hsts: boolean;
}

/**
 * Cabeceras de toda respuesta de la API (RNF-06). La API solo devuelve JSON, PDF y XLSX con
 * datos personales: no se guarda en cachés compartidas ni del navegador, no se incrusta y,
 * si alguien abriera una respuesta como página, no ejecutaría nada.
 */
export function securityHeadersMiddleware(options: SecurityHeadersOptions) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    response.removeHeader('X-Powered-By');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (options.hsts) response.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
    next();
  };
}
