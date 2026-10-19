import { z } from 'zod';

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_TTL_HOURS = 12;
const DEFAULT_SESSION_MAX_HOURS = 72;
const DEFAULT_LOGIN_MAX_ATTEMPTS = 5;
const DEFAULT_TEMP_PASSWORD_DAYS = 7;
const DEFAULT_LOGIN_LOCK_MINUTES = 15;
const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';
const DEFAULT_LOGIN_RATE_LIMIT_PER_MINUTE = 10;
const MAX_NOTICE_VERSION_LENGTH = 30;
const DEFAULT_INTEGRATION_TOKEN_MINUTES = 15;
const DEFAULT_INTEGRATION_RATE_LIMIT_PER_MINUTE = 60;
const MIN_TOKEN_SECRET_LENGTH = 32;
const DEFAULT_FOLLOW_UP_JOB_SECONDS = 60;
const DEFAULT_EMERGENCY_NOTICE_JOB_SECONDS = 60;
const DEFAULT_WHATSAPP_TEMPLATE = 'aviso_urgente_sirai';
const DEFAULT_WHATSAPP_LANGUAGE = 'es_MX';
const DEFAULT_WHATSAPP_API_VERSION = 'v21.0';

/** Una variable vacía (`VAR=` en .env o `${VAR:-}` en compose) significa «sin definir». */
const blankAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);
/** Llave pública de .env.example y CI; válida solo fuera de producción. */
export const EXAMPLE_DATA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

/**
 * Variables de entorno de `apps/api`. Los valores llegan como cadenas y aquí
 * se convierten y validan una sola vez al arrancar.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  DATABASE_URL: z
    .string()
    .url()
    .refine((url) => url.startsWith('mysql://'), { message: 'Debe ser una URL mysql://' }),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(DEFAULT_SESSION_TTL_HOURS),
  /** Tope absoluto de vida de una sesión, aunque siga en uso. */
  SESSION_MAX_HOURS: z.coerce.number().int().positive().default(DEFAULT_SESSION_MAX_HOURS),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(DEFAULT_LOGIN_MAX_ATTEMPTS),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(DEFAULT_LOGIN_LOCK_MINUTES),
  /** Días que dura una contraseña temporal antes de caducar (RF-38). */
  TEMP_PASSWORD_DAYS: z.coerce.number().int().positive().default(DEFAULT_TEMP_PASSWORD_DAYS),
  /** Intentos de login por IP y minuto antes de responder 429. */
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(DEFAULT_LOGIN_RATE_LIMIT_PER_MINUTE),
  COOKIE_SECURE: booleanFromString.default(false),
  /** true cuando la API corre detrás de un proxy inverso que fija X-Forwarded-For. */
  TRUST_PROXY: booleanFromString.default(false),
  WEB_ORIGIN: z.string().url().default(DEFAULT_WEB_ORIGIN),
  /** 32 bytes en hexadecimal (64 caracteres). Genera uno con `openssl rand -hex 32`. */
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, { message: 'Debe ser 32 bytes en hexadecimal (64 caracteres)' }),
  /** Cada cuántos segundos la API genera los tickets de ausencia vencidos; 0 apaga el proceso. */
  FOLLOW_UP_JOB_SECONDS: z.coerce.number().int().nonnegative().default(DEFAULT_FOLLOW_UP_JOB_SECONDS),
  /** Cada cuántos segundos la API envía los avisos de emergencia pendientes (RF-27); 0 apaga el proceso. */
  EMERGENCY_NOTICE_JOB_SECONDS: z.coerce.number().int().nonnegative().default(DEFAULT_EMERGENCY_NOTICE_JOB_SECONDS),
  /** Cuenta de WhatsApp Business (Cloud API) para avisar a los contactos de emergencia. Sin ella no se envía nada. */
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess(blankAsUndefined, z.string().trim().min(1).optional()),
  WHATSAPP_ACCESS_TOKEN: z.preprocess(blankAsUndefined, z.string().trim().min(1).optional()),
  /** Plantilla aprobada por Meta con el texto del aviso (sin variables). */
  WHATSAPP_TEMPLATE_NAME: z.preprocess(blankAsUndefined, z.string().trim().min(1).default(DEFAULT_WHATSAPP_TEMPLATE)),
  WHATSAPP_TEMPLATE_LANGUAGE: z.preprocess(blankAsUndefined, z.string().trim().min(1).default(DEFAULT_WHATSAPP_LANGUAGE)),
  WHATSAPP_API_VERSION: z.preprocess(blankAsUndefined, z.string().trim().min(1).default(DEFAULT_WHATSAPP_API_VERSION)),
  /**
   * Versión del aviso de privacidad vigente. El servidor la guarda como
   * evidencia en cada consentimiento; el cliente nunca la elige. La confirma
   * el área jurídica, por eso en producción es obligatoria.
   */
  /**
   * Llave con la que se firman los tokens de los sistemas externos (RF-37).
   * Fuera de producción, si falta, se deriva de DATA_ENCRYPTION_KEY; en
   * producción es obligatoria y distinta de ella, para que una no sirva de la otra.
   */
  API_TOKEN_SECRET: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(MIN_TOKEN_SECRET_LENGTH).optional()),
  /** Minutos que dura un token de sistema antes de pedir otro. */
  INTEGRATION_TOKEN_MINUTES: z.coerce.number().int().positive().default(DEFAULT_INTEGRATION_TOKEN_MINUTES),
  /** Peticiones por minuto que puede hacer cada sistema antes de recibir 429. */
  INTEGRATION_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(DEFAULT_INTEGRATION_RATE_LIMIT_PER_MINUTE),
  PRIVACY_NOTICE_VERSION: z.preprocess(
    // Una variable vacía (`VAR=` en .env o `${VAR:-}` en compose) significa "sin definir".
    (value) => (value === '' ? undefined : value),
    z.string().trim().min(1).max(MAX_NOTICE_VERSION_LENGTH).optional(),
  ),
})
  .refine((env) => env.NODE_ENV !== 'production' || env.COOKIE_SECURE, {
    path: ['COOKIE_SECURE'],
    message: 'En producción las cookies deben ser Secure (COOKIE_SECURE=true)',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.DATA_ENCRYPTION_KEY.toLowerCase() !== EXAMPLE_DATA_ENCRYPTION_KEY, {
    path: ['DATA_ENCRYPTION_KEY'],
    message: 'En producción no puede usarse la llave de ejemplo; genera una con openssl rand -hex 32',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.PRIVACY_NOTICE_VERSION !== undefined, {
    path: ['PRIVACY_NOTICE_VERSION'],
    message: 'En producción debe definirse la versión vigente del aviso de privacidad',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.API_TOKEN_SECRET !== undefined, {
    path: ['API_TOKEN_SECRET'],
    message: 'En producción debe definirse API_TOKEN_SECRET (openssl rand -hex 32), distinta de DATA_ENCRYPTION_KEY',
  })
  .refine((env) => env.API_TOKEN_SECRET === undefined || env.API_TOKEN_SECRET.toLowerCase() !== env.DATA_ENCRYPTION_KEY.toLowerCase(), {
    path: ['API_TOKEN_SECRET'],
    message: 'API_TOKEN_SECRET no puede ser igual a DATA_ENCRYPTION_KEY',
  })
  .refine((env) => (env.WHATSAPP_PHONE_NUMBER_ID === undefined) === (env.WHATSAPP_ACCESS_TOKEN === undefined), {
    path: ['WHATSAPP_ACCESS_TOKEN'],
    message: 'WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN se definen juntas o ninguna (y WHATSAPP_PHONE_NUMBER_ID debe acompañar al token)',
  })
  .refine((env) => env.WHATSAPP_ACCESS_TOKEN === undefined || env.WHATSAPP_ACCESS_TOKEN.toLowerCase() !== env.DATA_ENCRYPTION_KEY.toLowerCase(), {
    path: ['WHATSAPP_ACCESS_TOKEN'],
    message: 'WHATSAPP_ACCESS_TOKEN no puede ser igual a DATA_ENCRYPTION_KEY',
  })
  .refine((env) => env.SESSION_MAX_HOURS >= env.SESSION_TTL_HOURS, {
    path: ['SESSION_MAX_HOURS'],
    message: 'Debe ser mayor o igual que SESSION_TTL_HOURS',
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Fuente mínima de variables; compatible con `process.env` sin importar Node. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');

/**
 * Valida el entorno y devuelve la configuración tipada. Lanza un error legible
 * que nombra cada variable inválida para que el arranque falle rápido.
 */
export function parseApiEnv(source: EnvSource): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Configuración de entorno inválida: ${describeIssues(result.error)}`);
  }
  return result.data;
}
