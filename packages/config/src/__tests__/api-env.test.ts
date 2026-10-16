import { describe, expect, it } from 'vitest';
import { parseApiEnv } from '../api-env.js';

const minimal = {
  DATABASE_URL: 'mysql://sirai:sirai@localhost:3306/sirai',
  DATA_ENCRYPTION_KEY: '0'.repeat(64),
};

describe('parseApiEnv', () => {
  it('aplica valores por defecto cuando solo hay DATABASE_URL', () => {
    const env = parseApiEnv(minimal);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      SESSION_TTL_HOURS: 12,
      SESSION_MAX_HOURS: 72,
      TRUST_PROXY: false,
      LOGIN_MAX_ATTEMPTS: 5,
      LOGIN_LOCK_MINUTES: 15,
      LOGIN_RATE_LIMIT_PER_MINUTE: 10,
      COOKIE_SECURE: false,
      WEB_ORIGIN: 'http://localhost:5173',
    });
  });

  it('convierte cadenas numéricas y booleanas', () => {
    const env = parseApiEnv({ ...minimal, PORT: '4000', SESSION_TTL_HOURS: '2', COOKIE_SECURE: 'true' });
    expect(env.PORT).toBe(4000);
    expect(env.SESSION_TTL_HOURS).toBe(2);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('falla nombrando la variable ausente', () => {
    expect(() => parseApiEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rechaza una URL que no sea de MySQL', () => {
    expect(() => parseApiEnv({ ...minimal, DATABASE_URL: 'postgres://x/y' })).toThrow(/DATABASE_URL/);
  });

  it('rechaza una llave de cifrado que no sea de 32 bytes hexadecimales', () => {
    expect(() => parseApiEnv({ ...minimal, DATA_ENCRYPTION_KEY: 'corta' })).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it('exige cookies Secure en producción', () => {
    expect(() => parseApiEnv({ ...minimal, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE/);
    expect(parseApiEnv({ ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'true', PRIVACY_NOTICE_VERSION: 'AP-2026-1' }).COOKIE_SECURE).toBe(true);
  });

  it('rechaza la llave de ejemplo en producción', () => {
    const example = '0123456789abcdef'.repeat(4);
    const prod = { ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'true', PRIVACY_NOTICE_VERSION: 'AP-2026-1' };
    expect(() => parseApiEnv({ ...prod, DATA_ENCRYPTION_KEY: example })).toThrow(/llave de ejemplo/);
    expect(parseApiEnv({ ...minimal, DATA_ENCRYPTION_KEY: example }).NODE_ENV).toBe('development');
  });

  it('el tope absoluto de sesión no puede ser menor que la inactividad', () => {
    expect(() => parseApiEnv({ ...minimal, SESSION_TTL_HOURS: '24', SESSION_MAX_HOURS: '12' })).toThrow(/SESSION_MAX_HOURS/);
  });

  it('rechaza valores fuera de rango', () => {
    expect(() => parseApiEnv({ ...minimal, LOGIN_MAX_ATTEMPTS: '0' })).toThrow(/LOGIN_MAX_ATTEMPTS/);
  });

  it('la versión del aviso de privacidad es opcional fuera de producción', () => {
    expect(parseApiEnv(minimal).PRIVACY_NOTICE_VERSION).toBeUndefined();
    expect(parseApiEnv({ ...minimal, PRIVACY_NOTICE_VERSION: ' AP-2026-1 ' }).PRIVACY_NOTICE_VERSION).toBe('AP-2026-1');
  });

  it('trata una variable vacía como no definida', () => {
    expect(parseApiEnv({ ...minimal, PRIVACY_NOTICE_VERSION: '' }).PRIVACY_NOTICE_VERSION).toBeUndefined();
  });

  it('en producción exige la versión del aviso, porque queda como evidencia legal', () => {
    const prod = { ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'true', DATA_ENCRYPTION_KEY: 'f'.repeat(64) };
    expect(() => parseApiEnv(prod)).toThrow(/PRIVACY_NOTICE_VERSION/);
    expect(parseApiEnv({ ...prod, PRIVACY_NOTICE_VERSION: 'AP-2026-1' }).PRIVACY_NOTICE_VERSION).toBe('AP-2026-1');
  });

  it('rechaza una versión de aviso vacía o demasiado larga', () => {
    expect(() => parseApiEnv({ ...minimal, PRIVACY_NOTICE_VERSION: '   ' })).toThrow(/PRIVACY_NOTICE_VERSION/);
    expect(() => parseApiEnv({ ...minimal, PRIVACY_NOTICE_VERSION: 'x'.repeat(31) })).toThrow(/PRIVACY_NOTICE_VERSION/);
  });
});
