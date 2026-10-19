import { describe, expect, it } from 'vitest';
import { cookieFrom } from './client';

describe('cookieFrom', () => {
  it('toma solo el par nombre=valor de la cookie de sesión', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'sirai_session=abc123; Max-Age=259200; Path=/; HttpOnly; SameSite=Strict');
    expect(cookieFrom(headers)).toBe('sirai_session=abc123');
  });

  it('falla con claridad si el login no entregó cookie', () => {
    expect(() => cookieFrom(new Headers())).toThrow(/cookie/i);
  });
});
