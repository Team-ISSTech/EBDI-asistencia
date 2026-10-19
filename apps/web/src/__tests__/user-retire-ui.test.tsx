import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from '../features/administration/pages/users-page';
import { docenteSession, renderWithSession } from './test-utils';

const adminSession = {
  ...docenteSession,
  user: { id: 1, name: 'Admin Central', email: 'admin@sirai.test' },
  assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  permissions: ['USUARIO_ADMINISTRAR' as const],
};

const user = (id: number, name: string) => ({ id, name, email: `${name.toLowerCase().replace(' ', '.')}@sirai.test`, status: 'ACTIVO', assignments: [{ role: 'DOCENTE', estanciaId: 1 }], lastAccessAt: null });

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const posts = (fetchMock: ReturnType<typeof routeFetch>, path: string): number =>
  fetchMock.mock.calls.filter(([url, init]) => new URL(url).pathname === path && (init as RequestInit | undefined)?.method === 'POST').length;

describe('baja de usuarios (RNF-04)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ofrece dar de baja a las demás personas, no a quien tiene la sesión', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /usuarios': () => jsonResponse(200, { users: [user(1, 'Admin Central'), user(7, 'Ana Docente')] }) }));
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    expect(await screen.findByRole('button', { name: 'Dar de baja a Ana Docente' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dar de baja a Admin Central' })).toBeNull();
  });

  it('pide confirmación explícita, explica qué pasa y no llama hasta confirmar', async () => {
    const fetchMock = routeFetch({
      'GET /usuarios': () => jsonResponse(200, { users: [user(7, 'Ana Docente')] }),
      'POST /usuarios/7/baja': () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const u = userEvent.setup();
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await u.click(await screen.findByRole('button', { name: 'Dar de baja a Ana Docente' }));
    expect(screen.getByText(/Dejará de poder entrar y sus sesiones se cerrarán/)).toBeInTheDocument();
    expect(screen.getByText(/su correo no podrá usarse en una cuenta nueva/)).toBeInTheDocument();
    expect(posts(fetchMock, '/usuarios/7/baja')).toBe(0);
    await u.click(screen.getByRole('button', { name: 'Cancelar baja' }));
    expect(screen.queryByText(/Dejará de poder entrar/)).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Dar de baja a Ana Docente' }));
    await u.click(screen.getByRole('button', { name: 'Confirmar baja' }));
    await waitFor(() => expect(posts(fetchMock, '/usuarios/7/baja')).toBe(1));
  });

  it('muestra el rechazo del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'GET /usuarios': () => jsonResponse(200, { users: [user(7, 'Ana Docente')] }),
        'POST /usuarios/7/baja': () => jsonResponse(403, { error: { code: 'FUERA_DE_ALCANCE', message: 'No puedes darte de baja a ti mismo.' } }),
      }),
    );
    const u = userEvent.setup();
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await u.click(await screen.findByRole('button', { name: 'Dar de baja a Ana Docente' }));
    await u.click(screen.getByRole('button', { name: 'Confirmar baja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No puedes darte de baja a ti mismo.');
  });
});
