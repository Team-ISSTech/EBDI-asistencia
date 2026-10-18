import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildrenPage } from '../features/children/pages/children-page';
import { docenteSession, renderWithSession } from './test-utils';

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'INFANTE_ADMINISTRAR' as const],
};

const child = {
  id: 1,
  enrollmentNumber: 'M-0001',
  name: 'Infante',
  paternalSurname: 'Prueba',
  maternalSurname: null,
  birthDate: '2025-03-10',
  hasDisability: false,
  status: 'ACTIVO',
  roomId: 7,
  roomName: 'Lactantes (prueba)',
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const handler = handlers[key];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const bodiesOf = (fetchMock: ReturnType<typeof routeFetch>, method: string, path: string): unknown[] =>
  fetchMock.mock.calls
    .filter(([url, init]) => new URL(url).pathname === path && (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

const listOnly = { 'GET /infantes': () => jsonResponse(200, { children: [child] }) };

describe('editar y eliminar infantes (RF-33)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('una docente no ve editar ni eliminar', async () => {
    vi.stubGlobal('fetch', routeFetch(listOnly));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    await screen.findByText('Infante Prueba');
    expect(screen.queryByRole('button', { name: /Editar a Infante/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar a Infante/ })).not.toBeInTheDocument();
  });

  it('edita al infante: parte de sus datos y manda solo el cuerpo con lo escrito', async () => {
    const fetchMock = routeFetch({ ...listOnly, 'PATCH /infantes/1': () => jsonResponse(200, { ...child, name: 'Ana' }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Editar a Infante Prueba' }));
    const name = screen.getByLabelText('Nombre');
    expect(name).toHaveValue('Infante');
    expect(screen.queryByLabelText('Matrícula')).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Ana');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'PATCH', '/infantes/1')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'PATCH', '/infantes/1')[0]).toEqual({
      name: 'Ana',
      paternalSurname: 'Prueba',
      maternalSurname: null,
      birthDate: '2025-03-10',
      hasDisability: false,
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument());
  });

  it('con discapacidad pide el grupo solo si se escribe uno nuevo', async () => {
    const fetchMock = routeFetch({ 'GET /infantes': () => jsonResponse(200, { children: [{ ...child, hasDisability: true }] }), 'PATCH /infantes/1': () => jsonResponse(200, child) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Editar a Infante Prueba' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'PATCH', '/infantes/1')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'PATCH', '/infantes/1')[0]).not.toHaveProperty('disabilityGroup');
    await user.click(await screen.findByRole('button', { name: 'Editar a Infante Prueba' }));
    await user.type(screen.getByLabelText('Grupo de discapacidad (vacío para no cambiarlo)'), 'Motriz');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'PATCH', '/infantes/1')).toHaveLength(2));
    expect(bodiesOf(fetchMock, 'PATCH', '/infantes/1')[1]).toMatchObject({ hasDisability: true, disabilityGroup: 'Motriz' });
  });

  it('muestra el error del servidor al guardar, por ejemplo una CURP repetida', async () => {
    vi.stubGlobal('fetch', routeFetch({ ...listOnly, 'PATCH /infantes/1': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'Ya existe un infante con esa matrícula o CURP.' } }) }));
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Editar a Infante Prueba' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un infante con esa matrícula o CURP.');
  });

  it('eliminar pide confirmación explícita y no llama a la API hasta confirmar', async () => {
    const fetchMock = routeFetch({ ...listOnly, 'DELETE /infantes/1': () => new Response(null, { status: 204 }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Eliminar a Infante Prueba' }));
    expect(screen.getByText(/corrige un alta equivocada/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancelar eliminación' }));
    expect(screen.queryByText(/corrige un alta equivocada/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar a Infante Prueba' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true));
  });

  it('si el infante ya tiene asistencia, muestra el motivo del servidor', async () => {
    vi.stubGlobal('fetch', routeFetch({ ...listOnly, 'DELETE /infantes/1': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'El infante tiene asistencia registrada: su historial se conserva y no se puede eliminar.' } }) }));
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Eliminar a Infante Prueba' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('tiene asistencia registrada');
  });
});
