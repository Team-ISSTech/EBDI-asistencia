import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from '../features/administration/pages/users-page';
import { docenteSession, renderWithSession } from './test-utils';

const adminSession = {
  ...docenteSession,
  assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  permissions: ['USUARIO_ADMINISTRAR' as const],
};

const user = { id: 7, name: 'Ana Docente', email: 'ana@sirai.test', status: 'ACTIVO', assignments: [{ role: 'DOCENTE', estanciaId: 1 }], lastAccessAt: null };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const bodiesOf = (fetchMock: ReturnType<typeof routeFetch>, path: string): unknown[] =>
  fetchMock.mock.calls
    .filter(([url, init]) => new URL(url).pathname === path && (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe('restablecer la contraseña de un usuario (RF-38)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pide una contraseña temporal y la envía; avisa que la persona deberá cambiarla', async () => {
    const fetchMock = routeFetch({
      'GET /usuarios': () => jsonResponse(200, { users: [user] }),
      'POST /usuarios/7/contrasena-temporal': () => jsonResponse(201, user),
    });
    vi.stubGlobal('fetch', fetchMock);
    const u = userEvent.setup();
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await u.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Ana Docente' }));
    await u.type(screen.getByLabelText('Contraseña temporal'), 'Restablecida-2026');
    await u.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
    await waitFor(() => expect(bodiesOf(fetchMock, '/usuarios/7/contrasena-temporal')).toHaveLength(1));
    expect(bodiesOf(fetchMock, '/usuarios/7/contrasena-temporal')[0]).toEqual({ temporaryPassword: 'Restablecida-2026' });
    expect(await screen.findByRole('status')).toHaveTextContent('deberá cambiarla al entrar');
  });

  it('rechaza una contraseña corta sin llamar al servidor', async () => {
    const fetchMock = routeFetch({ 'GET /usuarios': () => jsonResponse(200, { users: [user] }) });
    vi.stubGlobal('fetch', fetchMock);
    const u = userEvent.setup();
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await u.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Ana Docente' }));
    await u.type(screen.getByLabelText('Contraseña temporal'), 'corta');
    await u.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos 10 caracteres');
    expect(bodiesOf(fetchMock, '/usuarios/7/contrasena-temporal')).toHaveLength(0);
  });

  it('muestra el rechazo del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'GET /usuarios': () => jsonResponse(200, { users: [user] }),
        'POST /usuarios/7/contrasena-temporal': () => jsonResponse(403, { error: { code: 'FUERA_DE_ALCANCE', message: 'No permitido.' } }),
      }),
    );
    const u = userEvent.setup();
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await u.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Ana Docente' }));
    await u.type(screen.getByLabelText('Contraseña temporal'), 'Restablecida-2026');
    await u.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No permitido.');
  });
});
