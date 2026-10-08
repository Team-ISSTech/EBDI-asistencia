import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import type { ApiError as ApiErrorBody } from '@sirai/contracts';
import type { Response } from 'express';
import { API_ENV } from '../config/config.module';
import type { RequestWithId } from '../http/request-context';
import { ApiError } from './api-error';

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Intenta de nuevo.';

const SERVER_ERROR_THRESHOLD = 500;

/** Códigos propios para excepciones HTTP de Nest (validación, throttler, 404). */
const CODE_BY_STATUS: Readonly<Record<number, ApiErrorBody['error']['code']>> = {
  [HttpStatus.TOO_MANY_REQUESTS]: 'DEMASIADAS_SOLICITUDES',
  [HttpStatus.NOT_FOUND]: 'NO_ENCONTRADO',
  [HttpStatus.BAD_REQUEST]: 'DATOS_INVALIDOS',
  [HttpStatus.UNAUTHORIZED]: 'NO_AUTENTICADO',
  [HttpStatus.FORBIDDEN]: 'SIN_PERMISO',
};

const codeForStatus = (status: number): ApiErrorBody['error']['code'] => CODE_BY_STATUS[status] ?? 'ERROR_INTERNO';

/** Convierte cualquier excepción al formato `{ error: { code, message } }`. */
export function toErrorBody(exception: unknown): { status: number; body: ApiErrorBody } {
  if (exception instanceof ApiError) {
    return { status: exception.getStatus(), body: { error: { code: exception.code, message: exception.message } } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const message = status >= SERVER_ERROR_THRESHOLD ? GENERIC_MESSAGE : exception.message;
    return { status, body: { error: { code: codeForStatus(status), message } } };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: { code: 'ERROR_INTERNO', message: GENERIC_MESSAGE } },
  };
}

/**
 * Resumen seguro para el log: nombre y código del driver, nunca el mensaje
 * completo (Drizzle incluye la consulta y sus parámetros: hashes, correos).
 */
export function describeForLog(exception: unknown, requestId: string | null): string {
  const name = exception instanceof Error ? exception.name : typeof exception;
  const cause = exception instanceof Error ? (exception.cause as { code?: unknown } | undefined) : undefined;
  const code = typeof cause?.code === 'string' ? cause.code : 'sin código';
  return `Error no controlado: ${name} (${code}) requestId=${requestId ?? 'sin id'}`;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorBody(exception);
    const http = host.switchToHttp();
    if (status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(describeForLog(exception, http.getRequest<RequestWithId>().id ?? null));
      // El stack completo solo fuera de producción: puede contener datos personales.
      if (this.env.NODE_ENV !== 'production' && exception instanceof Error) this.logger.debug(exception.stack);
    }
    http.getResponse<Response>().status(status).json(body);
  }
}
