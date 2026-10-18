import { describe, expect, it } from 'vitest';
import { changePasswordRequestSchema } from '../auth/change-password.js';
import { sessionResponseSchema } from '../auth/session.js';
import { resetPasswordRequestSchema } from '../users/user.js';

describe('changePasswordRequestSchema (RF-38)', () => {
  it('acepta la contraseña actual y una nueva de al menos diez caracteres', () => {
    expect(changePasswordRequestSchema.safeParse({ currentPassword: 'Temporal-2026', newPassword: 'una-clave-larga' }).success).toBe(true);
  });

  it('rechaza una nueva corta, también si el largo viene de espacios', () => {
    expect(changePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'corta' }).success).toBe(false);
    expect(changePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: '    corta    ' }).success).toBe(false);
  });

  it('exige la contraseña actual y limita el largo máximo', () => {
    expect(changePasswordRequestSchema.safeParse({ currentPassword: '', newPassword: 'una-clave-larga' }).success).toBe(false);
    expect(changePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('resetPasswordRequestSchema', () => {
  it('pide una contraseña temporal que cumpla el mismo largo mínimo', () => {
    expect(resetPasswordRequestSchema.safeParse({ temporaryPassword: 'Temporal-2026' }).success).toBe(true);
    expect(resetPasswordRequestSchema.safeParse({ temporaryPassword: 'corta' }).success).toBe(false);
  });
});

describe('sessionResponseSchema', () => {
  it('lleva si la sesión debe cambiar la contraseña antes de usar el sistema', () => {
    const base = { user: { id: 1, name: 'A', email: 'a@sirai.test' }, assignments: [], activeEstancia: null, availableEstancias: [], permissions: [] };
    expect(sessionResponseSchema.safeParse({ ...base, mustChangePassword: true }).success).toBe(true);
    expect(sessionResponseSchema.safeParse(base).success).toBe(false);
  });
});
