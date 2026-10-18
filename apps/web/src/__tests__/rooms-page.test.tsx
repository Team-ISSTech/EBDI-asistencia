import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomsPage } from '../features/administration/pages/rooms-page';
import { docenteSession, renderWithSession } from './test-utils';

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'SALA_ADMINISTRAR' as const],
};

const room = (id: number, overrides: Record<string, unknown> = {}) => ({
  id, estanciaId: 1, name: `Sala ${id}`, shift: 'MATUTINO', minAgeMonths: 0, maxAgeMonths: 18, capacity: 12, status: 'ACTIVO', enrolled: 0, ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (list: unknown[], handlers: Record<string, () => Response> = {}) => {
  const all: Record<string, () => Response> = { 'GET /administracion/salas': () => jsonResponse(200, { rooms: list }), ...handlers };
  return vi.fn((url: string, init?: RequestInit) => {
    const handler = all[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });
};

const bodyOf = (fetchMock: ReturnType<typeof routeFetch>, method: string, path: string): Record<string, unknown> | null => {
  const call = fetchMock.mock.calls.find(([url, init]) => new URL(url).pathname === path && (init as RequestInit | undefined)?.method === method);
  const raw = call ? (call[1] as RequestInit).body : undefined;
  return call ? (raw ? JSON.parse(String(raw)) : {}) : null;
};

const rowOf = async (name: string): Promise<HTMLElement> => (await screen.findByText(name)).closest('tr') as HTMLElement;

describe('RoomsPage (RF-32)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista las salas con turno, edades, capacidad, inscritos y estatus', async () => {
    vi.stubGlobal('fetch', routeFetch([room(1, { enrolled: 4 }), room(2, { shift: 'VESPERTINO', capacity: null, status: 'INACTIVO', minAgeMonths: null, maxAgeMonths: null })]));
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    const first = within(await rowOf('Sala 1'));
    expect(first.getByText('Matutino')).toBeInTheDocument();
    expect(first.getByText('0 a 18 meses')).toBeInTheDocument();
    expect(first.getByText('4 de 12')).toBeInTheDocument();
    const second = within(await rowOf('Sala 2'));
    expect(second.getByText('Vespertino')).toBeInTheDocument();
    expect(second.getByText('Sin límite')).toBeInTheDocument();
    expect(second.getByText('Inactiva')).toBeInTheDocument();
  });

  it('muestra el estado vacío y avisa si no carga', async () => {
    vi.stubGlobal('fetch', routeFetch([]));
    const { unmount } = renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    expect(await screen.findByText('Aún no hay salas')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } })));
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el catálogo de salas.');
  });

  it('crea una sala con turno, rango de edad y capacidad', async () => {
    const fetchMock = routeFetch([], { 'POST /administracion/salas': () => jsonResponse(201, room(9)) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva sala' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Maternal B');
    await userEvent.selectOptions(screen.getByLabelText('Turno'), 'VESPERTINO');
    await userEvent.type(screen.getByLabelText('Edad mínima (meses)'), '19');
    await userEvent.type(screen.getByLabelText('Edad máxima (meses)'), '36');
    await userEvent.type(screen.getByLabelText('Capacidad'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'POST', '/administracion/salas')).not.toBeNull());
    expect(bodyOf(fetchMock, 'POST', '/administracion/salas')).toEqual({ name: 'Maternal B', shift: 'VESPERTINO', minAgeMonths: 19, maxAgeMonths: 36, capacity: 20 });
  });

  it('las edades y la capacidad son opcionales', async () => {
    const fetchMock = routeFetch([], { 'POST /administracion/salas': () => jsonResponse(201, room(9)) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva sala' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Sala única');
    await userEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'POST', '/administracion/salas')).toEqual({ name: 'Sala única', shift: 'MATUTINO', minAgeMonths: null, maxAgeMonths: null, capacity: null }));
  });

  it('pide el nombre y avisa si la edad mínima supera a la máxima', async () => {
    const fetchMock = routeFetch([]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva sala' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el nombre de la sala.');
    await userEvent.type(screen.getByLabelText('Nombre'), 'X');
    await userEvent.type(screen.getByLabelText('Edad mínima (meses)'), '30');
    await userEvent.type(screen.getByLabelText('Edad máxima (meses)'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La edad mínima no puede ser mayor que la máxima.');
    expect(bodyOf(fetchMock, 'POST', '/administracion/salas')).toBeNull();
  });

  it('muestra el error del servidor al crear una sala repetida', async () => {
    vi.stubGlobal('fetch', routeFetch([], { 'POST /administracion/salas': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'Ya existe una sala con ese nombre y turno en la estancia.' } }) }));
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva sala' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Sala 1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una sala con ese nombre y turno');
  });

  it('edita la capacidad de una sala', async () => {
    const fetchMock = routeFetch([room(1)], { 'PATCH /administracion/salas/1': () => jsonResponse(200, room(1, { capacity: 15 })) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    await userEvent.click(within(await rowOf('Sala 1')).getByRole('button', { name: 'Editar Sala 1' }));
    const capacity = screen.getByLabelText('Capacidad');
    await userEvent.clear(capacity);
    await userEvent.type(capacity, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/administracion/salas/1')).not.toBeNull());
    expect(bodyOf(fetchMock, 'PATCH', '/administracion/salas/1')).toMatchObject({ capacity: 15 });
  });

  it('desactiva y reactiva una sala', async () => {
    const fetchMock = routeFetch([room(1), room(2, { status: 'INACTIVO' })], {
      'PATCH /administracion/salas/1': () => jsonResponse(200, room(1, { status: 'INACTIVO' })),
      'PATCH /administracion/salas/2': () => jsonResponse(200, room(2)),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    await userEvent.click(within(await rowOf('Sala 1')).getByRole('button', { name: 'Desactivar Sala 1' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/administracion/salas/1')).toEqual({ status: 'INACTIVO' }));
    await userEvent.click(within(await rowOf('Sala 2')).getByRole('button', { name: 'Reactivar Sala 2' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/administracion/salas/2')).toEqual({ status: 'ACTIVO' }));
  });

  it('la baja pide confirmación y explica el motivo si el servidor la rechaza', async () => {
    vi.stubGlobal('fetch', routeFetch([room(1, { enrolled: 3 })], { 'POST /administracion/salas/1/baja': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'La sala tiene infantes inscritos: muévelos antes de darla de baja.' } }) }));
    renderWithSession(<RoomsPage />, directoraSession, '/app/administracion/salas');
    await userEvent.click(within(await rowOf('Sala 1')).getByRole('button', { name: 'Dar de baja Sala 1' }));
    expect(screen.getByText(/La baja conserva el historial/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La sala tiene infantes inscritos');
  });
});
