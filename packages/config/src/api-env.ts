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
const DEFAULT_FOLLOW_UP_JOB_SECONDS = 60;
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
  /**
   * Versión del aviso de privacidad vigente. El servidor la guarda como
   * evidencia en cada consentimiento; el cliente nunca la elige. La confirma
   * el área jurídica, por eso en producción es obligatoria.
   */
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
