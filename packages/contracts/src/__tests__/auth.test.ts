import { describe, expect, it } from 'vitest';
import { loginRequestSchema } from '../auth/login.js';
import { sessionResponseSchema } from '../auth/session.js';
import { switchEstanciaRequestSchema } from '../auth/switch-estancia.js';

describe('loginRequestSchema', () => {
  it('acepta correo y contraseña válidos y normaliza el correo', () => {
    const parsed = loginRequestSchema.parse({ email: ' Docente@Sirai.test ', password: 'secreta123' });
    expect(parsed.email).toBe('docente@sirai.test');
  });

  it('rechaza correo inválido y contraseña vacía', () => {
    expect(loginRequestSchema.safeParse({ email: 'no-es-correo', password: 'x' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: 'a@b.mx', password: '' }).success).toBe(false);
  });
});

describe('switchEstanciaRequestSchema', () => {
  it('exige un entero positivo', () => {
    expect(switchEstanciaRequestSchema.safeParse({ estanciaId: 3 }).success).toBe(true);
    expect(switchEstanciaRequestSchema.safeParse({ estanciaId: 0 }).success).toBe(false);
    expect(switchEstanciaRequestSchema.safeParse({ estanciaId: '3' }).success).toBe(false);
  });
});

describe('sessionResponseSchema', () => {
  const valid = {
    user: { id: 1, name: 'Usuario Prueba', email: 'u@sirai.test' },
    assignments: [{ role: 'DOCENTE', estanciaId: 1, estanciaName: 'EBDI-TEST-01' }],
    activeEstancia: { id: 1, name: 'EBDI-TEST-01' },
    availableEstancias: [{ id: 1, name: 'EBDI-TEST-01' }],
    permissions: ['ASISTENCIA_CONSULTAR'],
    mustChangePassword: false,
  };

  it('acepta una sesión completa', () => {
    expect(sessionResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('acepta estancia activa nula (aún no seleccionada)', () => {
    expect(sessionResponseSchema.safeParse({ ...valid, activeEstancia: null }).success).toBe(true);
  });

  it('rechaza roles o permisos fuera del catálogo', () => {
    const badRole = { ...valid, assignments: [{ role: 'HACKER', estanciaId: null, estanciaName: null }] };
    const badPermission = { ...valid, permissions: ['BORRAR_TODO'] };
    expect(sessionResponseSchema.safeParse(badRole).success).toBe(false);
    expect(sessionResponseSchema.safeParse(badPermission).success).toBe(false);
  });
});
