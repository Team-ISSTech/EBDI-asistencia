import { ApiClientError } from '../../lib/api-client';

const MESSAGES: Readonly<Record<string, string>> = {
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  CUENTA_BLOQUEADA: 'La cuenta está bloqueada temporalmente. Espera unos minutos e intenta de nuevo.',
  DEMASIADAS_SOLICITUDES: 'Demasiados intentos seguidos. Espera un minuto.',
  DATOS_INVALIDOS: 'Revisa el correo y la contraseña.',
};

/** Mensaje para la persona a partir del código estable de la API. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return MESSAGES[error.code] ?? error.message;
  return 'No se pudo conectar con el servidor. Revisa tu conexión.';
}
