import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '../app/pages/home-page';
import { ForbiddenPage } from '../app/pages/forbidden-page';
import { createQueryClient, expireSessionOn401 } from '../app/query-client';
import { LoginPage } from '../features/auth/pages/login-page';
import { SelectEstanciaPage } from '../features/auth/pages/select-estancia-page';
import { postLoginPath, safeInternalPath } from '../features/auth/post-login-path';
import { RequireSession } from '../features/auth/require-session';
import { fetchSessionOrNull, SESSION_QUERY_KEY, useSessionActions } from '../features/auth/use-session';
import { ApiClientError, apiRequest } from '../lib/api-client';
import { docenteSession, renderWithSession } from './test-utils';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const twoEstancias = {
  ...docenteSession,
  activeEstancia: null,
  availableEstancias: [
    { id: 1, name: 'Estancia 1' },
    { id: 2, name: 'Estancia 2' },
  ],
};

describe('postLoginPath', () => {
  it('va al selector cuando hay estancias por elegir y ninguna activa', () => {
    expect(postLoginPath(twoEstancias, '/app/reportes')).toBe('/seleccionar-estancia');
  });

  it('respeta el destino pendiente cuando ya hay estancia activa', () => {
    expect(postLoginPath(docenteSession, '/app/infantes')).toBe('/app/infantes');
    expect(postLoginPath(docenteSession, undefined)).toBe('/app');
  });

  it('un rol central sin estancias disponibles entra directo', () => {
    expect(postLoginPath({ ...docenteSession, activeEstancia: null, availableEstancias: [] }, undefined)).toBe('/app');
  });

  it('descarta destinos externos o fuera de la app (redirección abierta)', () => {
    expect(postLoginPath(docenteSession, '//evil.com/app')).toBe('/app');
    expect(postLoginPath(docenteSession, 'https://evil.com')).toBe('/app');
    expect(postLoginPath(docenteSession, '/iniciar-sesion')).toBe('/app');
    expect(safeInternalPath('/app/auditoria')).toBe('/app/auditoria');
  });
});

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envía las credenciales y redirige según la sesión devuelta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, twoEstancias));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<LoginPage />, null, '/iniciar-sesion');
    await userEvent.type(screen.getByLabelText('Correo'), 'docente@sirai.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByText('Pantalla de selección de estancia')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/login$/);
    expect(JSON.parse(String(init.body))).toEqual({ email: 'docente@sirai.test', password: 'secreta-1234' });
  });

  it('muestra el error de credenciales junto a la contraseña', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'CREDENCIALES_INVALIDAS', message: 'x' } })));
    renderWithSession(<LoginPage />, null, '/iniciar-sesion');
    await userEvent.type(screen.getByLabelText('Correo'), 'docente@sirai.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it('con sesión ya abierta redirige a la app sin mostrar el formulario', () => {
    renderWithSession(<LoginPage />, docenteSession, '/iniciar-sesion');
    expect(screen.getByText('Pantalla de la app')).toBeInTheDocument();
    expect(screen.queryByLabelText('Correo')).toBeNull();
  });
});

describe('SelectEstanciaPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('activa la estancia elegida y entra a la app', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ...twoEstancias, activeEstancia: { id: 2, name: 'Estancia 2' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<SelectEstanciaPage />, twoEstancias, '/seleccionar-estancia');
    await userEvent.click(screen.getByRole('button', { name: 'Estancia 2' }));
    await waitFor(() => expect(screen.getByText('Pantalla de la app')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/estancia$/);
    expect(JSON.parse(String(init.body))).toEqual({ estanciaId: 2 });
  });
});

describe('sesión caducada y limpieza de caché', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetchSessionOrNull convierte 401 en null y propaga otros errores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'NO_AUTENTICADO', message: 'x' } })));
    await expect(fetchSessionOrNull()).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 500 })));
    await expect(fetchSessionOrNull()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('un 401 real en otra consulta invalida la sesión en caché a través del cliente de producción', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'NO_AUTENTICADO', message: 'x' } })));
    const client = createQueryClient();
    client.setQueryData(SESSION_QUERY_KEY, docenteSession);
    await client.fetchQuery({ queryKey: ['users'], queryFn: () => apiRequest('/usuarios') }).catch(() => undefined);
    await waitFor(() => expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull());
  });

  it('tras un 401 en otra consulta, el subárbol protegido manda a iniciar sesión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'NO_AUTENTICADO', message: 'x' } })));
    const client = createQueryClient();
    renderWithSession(
      <RequireSession>
        <p>Dentro</p>
      </RequireSession>,
      docenteSession,
      '/app/pase-de-lista',
      undefined,
      { client },
    );
    expect(screen.getByText('Dentro')).toBeInTheDocument();
    await client.fetchQuery({ queryKey: ['users'], queryFn: () => apiRequest('/usuarios') }).catch(() => undefined);
    await waitFor(() => expect(screen.getByText('Pantalla de inicio de sesión')).toBeInTheDocument());
    expect(screen.queryByText('Dentro')).toBeNull();
  });

  it('expireSessionOn401 ignora errores que no sean 401', () => {
    const client = createQueryClient();
    client.setQueryData(SESSION_QUERY_KEY, docenteSession);
    expireSessionOn401(client, new ApiClientError(500, 'ERROR_INTERNO', 'x'));
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual(docenteSession);
  });

  it('no reintenta errores 4xx pero sí fallos de red', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (n: number, e: unknown) => boolean;
    expect(retry(0, new ApiClientError(403, 'SIN_PERMISO', 'x'))).toBe(false);
    expect(retry(0, new TypeError('fetch failed'))).toBe(true);
    expect(retry(1, new TypeError('fetch failed'))).toBe(false);
  });

  it('cerrar sesión borra lo demás de la caché (tabletas compartidas)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(204, null)));
    function Probe() {
      const { logout } = useSessionActions();
      return (
        <button type="button" onClick={() => logout.mutate()}>
          Salir
        </button>
      );
    }
    const { client } = renderWithSession(<Probe />, docenteSession, '/app', (c) => c.setQueryData(['users'], { users: [] }));
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull());
    expect(client.getQueryData(['users'])).toBeUndefined();
  });
});

describe('RequireSession con error de red', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra reintentar en vez de mandar a iniciar sesión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 503 })));
    renderWithSession(
      <RequireSession>
        <p>Dentro</p>
      </RequireSession>,
      undefined,
    );
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de inicio de sesión')).toBeNull();
  });
});

describe('HomePage y ForbiddenPage', () => {
  it('HomePage manda a la primera sección permitida', () => {
    renderWithSession(<HomePage />, docenteSession, '/app');
    expect(screen.getByText('Pantalla pase de lista')).toBeInTheDocument();
  });

  it('HomePage sin permisos muestra el aviso', () => {
    renderWithSession(<HomePage />, { ...docenteSession, permissions: [] }, '/app');
    expect(screen.getByRole('heading', { name: /no está disponible/ })).toBeInTheDocument();
  });

  it('el botón de ForbiddenPage vuelve al inicio', async () => {
    renderWithSession(<ForbiddenPage />, docenteSession, '/app/sin-permiso');
    await userEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(screen.getByText('Pantalla de la app')).toBeInTheDocument();
  });
});
