import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../app/shell/app-shell';
import { loginErrorMessage } from '../features/auth/error-messages';
import { useSessionActions } from '../features/auth/use-session';
import { ApiClientError } from '../lib/api-client';
import { docenteSession, renderWithSession } from './test-utils';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('AppShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra persona, sello de estancia y solo las secciones permitidas', () => {
    renderWithSession(<AppShell />, docenteSession, '/app');
    expect(screen.getByText('Docente Prueba')).toBeInTheDocument();
    expect(screen.getByText('Estancia de prueba 01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pase de lista' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
  });

  it('cerrar sesión llama a la API y vuelve a iniciar sesión', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<AppShell />, docenteSession, '/app');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(screen.getByText('Pantalla de inicio de sesión')).toBeInTheDocument());
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/auth\/logout$/);
  });

  it('ofrece elegir estancia cuando no hay una activa', () => {
    renderWithSession(<AppShell />, { ...docenteSession, activeEstancia: null }, '/app');
    expect(screen.getByRole('link', { name: 'Sin estancia activa' })).toHaveAttribute('href', '/seleccionar-estancia');
  });
});

function LoginProbe() {
  const { login } = useSessionActions();
  return (
    <button type="button" onClick={() => login.mutate({ email: 'a@b.mx', password: 'x' })}>
      {login.isSuccess ? `Hola ${login.data.user.name}` : 'Entrar'}
    </button>
  );
}

describe('useSessionActions.login', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deja la sesión devuelta por la API en caché', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, docenteSession)));
    renderWithSession(<LoginProbe />, null);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hola Docente Prueba' })).toBeInTheDocument());
  });
});

describe('loginErrorMessage', () => {
  it('traduce códigos conocidos y conserva el mensaje de la API para el resto', () => {
    expect(loginErrorMessage(new ApiClientError(401, 'CUENTA_BLOQUEADA', 'x'))).toMatch(/bloqueada/);
    expect(loginErrorMessage(new ApiClientError(500, 'OTRO', 'Mensaje de la API'))).toBe('Mensaje de la API');
    expect(loginErrorMessage(new TypeError('fetch failed'))).toMatch(/conexión/);
  });
});
