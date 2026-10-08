import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from '../features/administration/pages/users-page';
import { UserForm } from '../features/administration/user-form';
import { ApiClientError } from '../lib/api-client';
import { docenteSession, renderWithSession } from './test-utils';

const adminSession = {
  ...docenteSession,
  user: { id: 9, name: 'Admin Central', email: 'admin_central@sirai.test' },
  assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  availableEstancias: [
    { id: 1, name: 'Estancia 1' },
    { id: 2, name: 'Estancia 2' },
  ],
  permissions: ['USUARIO_ADMINISTRAR' as const, 'AUDITORIA_CONSULTAR' as const],
};

const listed = {
  users: [
    { id: 1, name: 'Docente Uno', email: 'uno@sirai.test', status: 'ACTIVO', assignments: [{ role: 'DOCENTE', estanciaId: 1 }], lastAccessAt: null },
  ],
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('UsersPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('carga y muestra la tabla de usuarios desde la API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, listed)));
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    expect(await screen.findByText('Docente Uno')).toBeInTheDocument();
    expect(screen.getByText('Docente · Estancia 1')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay usuarios', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { users: [] })));
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    expect(await screen.findByText('Aún no hay usuarios')).toBeInTheDocument();
  });

  it('abre el formulario de alta y envía el usuario a la API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, listed))
      .mockResolvedValueOnce(jsonResponse(201, { ...listed.users[0], id: 2, name: 'Nueva', email: 'nueva@sirai.test' }))
      .mockResolvedValue(jsonResponse(200, listed));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await screen.findByText('Docente Uno');
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nueva');
    await userEvent.type(screen.getByLabelText('Correo'), 'nueva@sirai.test');
    await userEvent.type(screen.getByLabelText('Contraseña temporal'), 'Temporal-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar rol' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Nueva',
      email: 'nueva@sirai.test',
      temporaryPassword: 'Temporal-2026',
      assignments: [{ role: 'DOCENTE', estanciaId: 1 }],
    });
    // Al guardar, el formulario se cierra y la lista se vuelve a pedir.
    await waitFor(() => expect(screen.queryByLabelText('Nombre')).toBeNull());
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('muestra el error de alta en un aviso general cuando no es del correo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, listed))
      .mockResolvedValueOnce(jsonResponse(400, { error: { code: 'DATOS_INVALIDOS', message: 'Alguna estancia indicada no existe.' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await screen.findByText('Docente Uno');
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nueva');
    await userEvent.type(screen.getByLabelText('Correo'), 'nueva@sirai.test');
    await userEvent.type(screen.getByLabelText('Contraseña temporal'), 'Temporal-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Alguna estancia indicada no existe.');
  });

  it('el error de guardar roles no se arrastra al editor de otro usuario', async () => {
    const twoUsers = { users: [listed.users[0], { ...listed.users[0], id: 2, name: 'Docente Dos', email: 'dos@sirai.test' }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, twoUsers))
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await screen.findByText('Docente Dos');
    await userEvent.click(screen.getAllByRole('button', { name: 'Editar roles' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar roles' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron guardar los roles.');
    await userEvent.click(screen.getAllByRole('button', { name: 'Editar roles' })[1]!);
    expect(screen.getByText('Roles de Docente Dos')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('permite editar roles y envía el reemplazo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, listed))
      .mockResolvedValueOnce(jsonResponse(200, { ...listed.users[0], assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] }))
      .mockResolvedValue(jsonResponse(200, listed));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<UsersPage />, adminSession, '/app/administracion/usuarios');
    await screen.findByText('Docente Uno');
    await userEvent.click(screen.getByRole('button', { name: 'Editar roles' }));
    await userEvent.selectOptions(screen.getByLabelText('Rol 1'), 'DIRECTORA');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar roles' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/usuarios\/1\/roles$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] });
    await waitFor(() => expect(screen.queryByText(/Roles de/)).toBeNull());
  });
});

describe('UserForm', () => {
  it('muestra el conflicto de correo junto al campo', () => {
    renderWithSession(
      <UserForm estancias={[]} pending={false} error={new ApiClientError(409, 'CONFLICTO', 'x')} onSubmit={vi.fn()} />,
      adminSession,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe un usuario con ese correo.');
  });
});
