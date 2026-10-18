import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Códigos estables que la web interpreta. Los mensajes son para personas;
 * los códigos, para programas. Ninguno revela información interna.
 */
export const ERROR_CODES = {
  DATOS_INVALIDOS: HttpStatus.BAD_REQUEST,
  NO_AUTENTICADO: HttpStatus.UNAUTHORIZED,
  CREDENCIALES_INVALIDAS: HttpStatus.UNAUTHORIZED,
  CUENTA_BLOQUEADA: HttpStatus.UNAUTHORIZED,
  CONTRASENA_TEMPORAL_CADUCADA: HttpStatus.UNAUTHORIZED,
  CAMBIO_CONTRASENA_REQUERIDO: HttpStatus.FORBIDDEN,
  SIN_PERMISO: HttpStatus.FORBIDDEN,
  FUERA_DE_ALCANCE: HttpStatus.FORBIDDEN,
  NO_ENCONTRADO: HttpStatus.NOT_FOUND,
  CONFLICTO: HttpStatus.CONFLICT,
  DEMASIADAS_SOLICITUDES: HttpStatus.TOO_MANY_REQUESTS,
  ERROR_INTERNO: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Excepción de dominio con código estable; el filtro la serializa. */
export class ApiError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super({ error: { code, message } }, ERROR_CODES[code]);
    // HttpException deriva `message` del nombre de la clase cuando la
    // respuesta es un objeto; se fija explícitamente.
    this.message = message;
  }
}
