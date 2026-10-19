import { describe, expect, it } from 'vitest';
import { parseApiEnv } from '../api-env.js';

const SECRET = 'k'.repeat(40);

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
      TEMP_PASSWORD_DAYS: 7,
      INTEGRATION_TOKEN_MINUTES: 15,
      INTEGRATION_RATE_LIMIT_PER_MINUTE: 60,
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

  it('la contraseña temporal dura 7 días salvo que se configure otra cosa, y debe ser positiva', () => {
    expect(parseApiEnv({ ...minimal, TEMP_PASSWORD_DAYS: '3' }).TEMP_PASSWORD_DAYS).toBe(3);
    expect(() => parseApiEnv({ ...minimal, TEMP_PASSWORD_DAYS: '0' })).toThrow(/TEMP_PASSWORD_DAYS/);
  });

  describe('tokens de sistemas externos (RF-37)', () => {
    it('la llave de firma es opcional fuera de producción, y si se da debe tener al menos 32 caracteres', () => {
      expect(parseApiEnv(minimal).API_TOKEN_SECRET).toBeUndefined();
      expect(parseApiEnv({ ...minimal, API_TOKEN_SECRET: SECRET }).API_TOKEN_SECRET).toBe(SECRET);
      expect(() => parseApiEnv({ ...minimal, API_TOKEN_SECRET: 'corta' })).toThrow(/API_TOKEN_SECRET/);
    });

    it('una variable vacía cuenta como no definida', () => {
      expect(parseApiEnv({ ...minimal, API_TOKEN_SECRET: '' }).API_TOKEN_SECRET).toBeUndefined();
    });

    it('en producción es obligatoria y no puede ser la llave de cifrado', () => {
      const prod = { ...minimal, DATA_ENCRYPTION_KEY: 'f'.repeat(64), NODE_ENV: 'production', COOKIE_SECURE: 'true', PRIVACY_NOTICE_VERSION: 'AP-2026-1' };
      expect(() => parseApiEnv(prod)).toThrow(/API_TOKEN_SECRET/);
      expect(() => parseApiEnv({ ...prod, API_TOKEN_SECRET: 'f'.repeat(64) })).toThrow(/API_TOKEN_SECRET/);
      expect(parseApiEnv({ ...prod, API_TOKEN_SECRET: SECRET }).API_TOKEN_SECRET).toBe(SECRET);
    });

    it('la duración del token y el límite por sistema son positivos y configurables', () => {
      const env = parseApiEnv({ ...minimal, INTEGRATION_TOKEN_MINUTES: '5', INTEGRATION_RATE_LIMIT_PER_MINUTE: '120' });
      expect(env).toMatchObject({ INTEGRATION_TOKEN_MINUTES: 5, INTEGRATION_RATE_LIMIT_PER_MINUTE: 120 });
      expect(() => parseApiEnv({ ...minimal, INTEGRATION_TOKEN_MINUTES: '0' })).toThrow(/INTEGRATION_TOKEN_MINUTES/);
    });
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
    expect(parseApiEnv({ ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'true', PRIVACY_NOTICE_VERSION: 'AP-2026-1', API_TOKEN_SECRET: SECRET }).COOKIE_SECURE).toBe(true);
  });

  it('rechaza la llave de ejemplo en producción', () => {
    const example = '0123456789abcdef'.repeat(4);
    const prod = { ...minimal, NODE_ENV: 'production', COOKIE_SECURE: 'true', PRIVACY_NOTICE_VERSION: 'AP-2026-1', API_TOKEN_SECRET: SECRET };
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
    expect(parseApiEnv({ ...prod, PRIVACY_NOTICE_VERSION: 'AP-2026-1', API_TOKEN_SECRET: SECRET }).PRIVACY_NOTICE_VERSION).toBe('AP-2026-1');
  });

  it('rechaza una versión de aviso vacía o demasiado larga', () => {
    expect(() => parseApiEnv({ ...minimal, PRIVACY_NOTICE_VERSION: '   ' })).toThrow(/PRIVACY_NOTICE_VERSION/);
    expect(() => parseApiEnv({ ...minimal, PRIVACY_NOTICE_VERSION: 'x'.repeat(31) })).toThrow(/PRIVACY_NOTICE_VERSION/);
  });

  it('el proceso de tickets corre cada 60 segundos por omisión y se puede apagar con 0', () => {
    expect(parseApiEnv(minimal).FOLLOW_UP_JOB_SECONDS).toBe(60);
    expect(parseApiEnv({ ...minimal, FOLLOW_UP_JOB_SECONDS: '0' }).FOLLOW_UP_JOB_SECONDS).toBe(0);
    expect(() => parseApiEnv({ ...minimal, FOLLOW_UP_JOB_SECONDS: '-5' })).toThrow(/FOLLOW_UP_JOB_SECONDS/);
  });

  describe('avisos por WhatsApp (RF-27)', () => {
    const whatsapp = { WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_ACCESS_TOKEN: 'token-de-prueba' };

    it('sin cuenta el canal queda apagado y el proceso corre cada minuto', () => {
      const env = parseApiEnv(minimal);
      expect(env.WHATSAPP_PHONE_NUMBER_ID).toBeUndefined();
      expect(env.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
      expect(env.WHATSAPP_TEMPLATE_NAME).toBe('aviso_urgente_sirai');
      expect(env.WHATSAPP_TEMPLATE_LANGUAGE).toBe('es_MX');
      expect(env.EMERGENCY_NOTICE_JOB_SECONDS).toBe(60);
    });

    it('variables vacías cuentan como sin definir', () => {
      const env = parseApiEnv({ ...minimal, WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_ACCESS_TOKEN: '' });
      expect(env.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
    });

    it('la cuenta se configura completa: número y token van juntos', () => {
      expect(parseApiEnv({ ...minimal, ...whatsapp }).WHATSAPP_PHONE_NUMBER_ID).toBe('123456');
      expect(() => parseApiEnv({ ...minimal, WHATSAPP_PHONE_NUMBER_ID: '123456' })).toThrow(/WHATSAPP_ACCESS_TOKEN/);
      expect(() => parseApiEnv({ ...minimal, WHATSAPP_ACCESS_TOKEN: 'token-de-prueba' })).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
    });

    it('el token no puede ser la llave de cifrado', () => {
      expect(() => parseApiEnv({ ...minimal, WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_ACCESS_TOKEN: minimal.DATA_ENCRYPTION_KEY })).toThrow(/WHATSAPP_ACCESS_TOKEN/);
    });
  });

  describe('conexiones a la base (RNF-08)', () => {
    it('el pool es de 25 conexiones salvo que se configure otro tamaño', () => {
      expect(parseApiEnv(minimal).DB_POOL_SIZE).toBe(25);
      expect(parseApiEnv({ ...minimal, DB_POOL_SIZE: '40' }).DB_POOL_SIZE).toBe(40);
    });

    it('rechaza un tamaño que no sea un entero positivo', () => {
      expect(() => parseApiEnv({ ...minimal, DB_POOL_SIZE: '0' })).toThrow(/DB_POOL_SIZE/);
      expect(() => parseApiEnv({ ...minimal, DB_POOL_SIZE: 'muchas' })).toThrow(/DB_POOL_SIZE/);
    });
  });
});
