import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordPage } from '../features/auth/pages/change-password-page';
import { RequireSession } from '../features/auth/require-session';
import { postLoginPath } from '../features/auth/post-login-path';
import { docenteSession, renderWithSession } from './test-utils';

const pendingSession = { ...docenteSession, permissions: [], mustChangePassword: true };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const postedBody = (fetchMock: ReturnType<typeof routeFetch>): unknown => {
  const call = fetchMock.mock.calls.find(([url, init]) => new URL(url).pathname === '/auth/contrasena' && (init as RequestInit | undefined)?.method === 'POST');
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
};

const fill = async (current: string, next: string, confirm = next) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Contraseña actual|Contraseña temporal/), current);
  await user.type(screen.getByLabelText('Contraseña nueva'), next);
  await user.type(screen.getByLabelText('Confirmar contraseña nueva'), confirm);
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
};

describe('pantalla de cambio de contraseña (RF-38)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('con una contraseña temporal es obligatoria: lo explica, no ofrece cancelar y permite cerrar sesión', () => {
    renderWithSession(<ChangePasswordPage />, pendingSession, '/cambiar-contrasena');
    expect(screen.getByRole('heading', { name: 'Cambia tu contraseña temporal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña temporal')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Volver' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('de forma voluntaria pide la contraseña actual y permite volver', () => {
    renderWithSession(<ChangePasswordPage />, docenteSession, '/cambiar-contrasena');
    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('valida en pantalla, sin llamar al servidor: nueva corta, no coincide o igual a la actual', async () => {
    const fetchMock = routeFetch({});
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ChangePasswordPage />, pendingSession, '/cambiar-contrasena');
    await fill('Temporal-2026', 'corta');
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña nueva debe tener al menos 10 caracteres.');
    expect(postedBody(fetchMock)).toBeUndefined();
  });

  it('avisa si la confirmación no coincide', async () => {
    const fetchMock = routeFetch({});
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ChangePasswordPage />, pendingSession, '/cambiar-contrasena');
    await fill('Temporal-2026', 'una-clave-larga-1', 'una-clave-larga-2');
    expect(await screen.findByRole('alert')).toHaveTextContent('La confirmación no coincide con la contraseña nueva.');
    expect(postedBody(fetchMock)).toBeUndefined();
  });

  it('avisa si la nueva es igual a la actual', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    renderWithSession(<ChangePasswordPage />, pendingSession, '/cambiar-contrasena');
    await fill('Temporal-2026', 'Temporal-2026');
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña nueva debe ser distinta de la actual.');
  });

  it('envía la actual y la nueva, deja la sesión sin la marca y entra a la aplicación', async () => {
    const fetchMock = routeFetch({ 'POST /auth/contrasena': () => jsonResponse(200, { ...docenteSession, mustChangePassword: false }) });
    vi.stubGlobal('fetch', fetchMock);
    const { client } = renderWithSession(<ChangePasswordPage />, pendingSession, '/cambiar-contrasena');
    await fill('Temporal-2026', 'una-clave-nueva-larga');
    await waitFor(() => expect(postedBody(fetchMock)).toEqual({ currentPassword: 'Temporal-2026', newPassword: 'una-clave-nueva-larga' }));
    expect(await screen.findByText('Pantalla de la app')).toBeInTheDocument();
    expect(client.getQueryData<{ mustChangePassword: boolean }>(['session'])?.mustChangePassword).toBe(false);
  });

  it('muestra el rechazo del servidor, por ejemplo la contraseña actual incorrecta', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'POST /auth/contrasena': () => jsonResponse(401, { error: { code: 'CREDENCIALES_INVALIDAS', message: 'La contraseña actual es incorrecta.' } }) }));
    renderWithSession(<ChangePasswordPage />, pendingSession, '/cambiar-contrasena');
    await fill('mala-clave-123', 'una-clave-nueva-larga');
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual es incorrecta.');
  });

  it('no muestra ni conserva las contraseñas escritas en texto visible', () => {
    renderWithSession(<ChangePasswordPage />, pendingSession, '/cambiar-contrasena');
    for (const label of ['Contraseña temporal', 'Contraseña nueva', 'Confirmar contraseña nueva']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password');
    }
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('autocomplete', 'new-password');
  });
});

describe('acceso con contraseña temporal sin cambiar', () => {
  it('RequireSession lleva a cambiarla en cualquier pantalla de la aplicación', async () => {
    renderWithSession(
      <RequireSession>
        <p>Contenido protegido</p>
      </RequireSession>,
      pendingSession,
      '/app/infantes',
    );
    expect(await screen.findByText('Pantalla de cambio de contraseña')).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });

  it('en la propia pantalla de cambio no se redirige en bucle', () => {
    renderWithSession(
      <RequireSession>
        <p>Pantalla para cambiarla</p>
      </RequireSession>,
      pendingSession,
      '/cambiar-contrasena',
    );
    expect(screen.getByText('Pantalla para cambiarla')).toBeInTheDocument();
  });

  it('una sesión normal no se desvía', () => {
    renderWithSession(
      <RequireSession>
        <p>Contenido protegido</p>
      </RequireSession>,
      docenteSession,
      '/app/infantes',
    );
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });

  it('tras iniciar sesión con una temporal se va directo a cambiarla, antes que a elegir estancia', () => {
    expect(postLoginPath(pendingSession, undefined)).toBe('/cambiar-contrasena');
    expect(postLoginPath({ ...pendingSession, activeEstancia: null }, '/app/infantes')).toBe('/cambiar-contrasena');
    expect(postLoginPath(docenteSession, undefined)).toBe('/app');
  });
});
