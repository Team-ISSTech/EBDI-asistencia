import { describe, expect, it } from 'vitest';
import { checkNewPassword, isTemporaryPasswordExpired, PASSWORD_MIN_LENGTH, temporaryPasswordExpiry } from '../password-policy.js';

describe('checkNewPassword (RF-38)', () => {
  it('acepta una contraseña del largo mínimo que no repite la actual', () => {
    expect(checkNewPassword('x'.repeat(PASSWORD_MIN_LENGTH), 'otra-contrasena')).toEqual({ ok: true });
  });

  it('rechaza una contraseña más corta que el mínimo', () => {
    expect(checkNewPassword('x'.repeat(PASSWORD_MIN_LENGTH - 1), 'otra-contrasena')).toEqual({ ok: false, reason: 'MUY_CORTA' });
  });

  it('no cuenta los espacios de los extremos para el largo mínimo', () => {
    expect(checkNewPassword(`   ${'x'.repeat(PASSWORD_MIN_LENGTH - 1)}   `, 'otra')).toEqual({ ok: false, reason: 'MUY_CORTA' });
  });

  it('rechaza repetir la contraseña actual', () => {
    const same = 'contrasena-larga-1';
    expect(checkNewPassword(same, same)).toEqual({ ok: false, reason: 'IGUAL_A_LA_ACTUAL' });
  });

  it('el mínimo es de diez caracteres, como la contraseña temporal que fija el administrador', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
});

describe('contraseña temporal', () => {
  const now = new Date('2026-10-18T12:00:00Z');

  it('caduca el número de días configurado después de emitirse', () => {
    expect(temporaryPasswordExpiry(now, 7).toISOString()).toBe('2026-10-25T12:00:00.000Z');
  });

  it('sin fecha de caducidad no hay caducidad; con fecha, caduca al llegar a ella', () => {
    expect(isTemporaryPasswordExpired(null, now)).toBe(false);
    expect(isTemporaryPasswordExpired(new Date('2026-10-18T12:00:01Z'), now)).toBe(false);
    expect(isTemporaryPasswordExpired(new Date('2026-10-18T12:00:00Z'), now)).toBe(true);
    expect(isTemporaryPasswordExpired(new Date('2026-10-17T00:00:00Z'), now)).toBe(true);
  });
});
