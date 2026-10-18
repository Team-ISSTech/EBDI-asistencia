import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EstanciasPage } from '../features/administration/pages/estancias-page';
import { docenteSession, renderWithSession } from './test-utils';

const adminSession = {
  ...docenteSession,
  assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  permissions: ['ESTANCIA_ADMINISTRAR' as const, 'USUARIO_ADMINISTRAR' as const],
};

const estancia = (id: number, overrides: Record<string, unknown> = {}) => ({
  id, code: `EBDI-${id}`, name: `Estancia ${id}`, ur: null, region: 'Norte', address: null, timeZone: 'America/Mexico_City', status: 'ACTIVA', ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (list: unknown[], handlers: Record<string, () => Response> = {}) => {
  const all: Record<string, () => Response> = { 'GET /administracion/estancias': () => jsonResponse(200, { estancias: list }), ...handlers };
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

describe('EstanciasPage (RF-31)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista las estancias con clave, región, zona horaria y estatus', async () => {
    vi.stubGlobal('fetch', routeFetch([estancia(1), estancia(2, { status: 'INACTIVA', region: null })]));
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    const active = within(await rowOf('Estancia 1'));
    expect(active.getByText('EBDI-1')).toBeInTheDocument();
    expect(active.getByText('Norte')).toBeInTheDocument();
    expect(active.getByText('Activa')).toBeInTheDocument();
    expect(within(await rowOf('Estancia 2')).getByText('Inactiva')).toBeInTheDocument();
  });

  it('muestra el estado vacío y avisa si no carga', async () => {
    vi.stubGlobal('fetch', routeFetch([]));
    const { unmount } = renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    expect(await screen.findByText('Aún no hay estancias')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } })));
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el catálogo de estancias.');
  });

  it('crea una estancia con su clave, nombre, región y zona horaria', async () => {
    const fetchMock = routeFetch([], { 'POST /administracion/estancias': () => jsonResponse(201, estancia(7)) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva estancia' }));
    await userEvent.type(screen.getByLabelText('Clave EBDI'), 'ebdi-007');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Estancia Siete');
    await userEvent.type(screen.getByLabelText('Región'), 'Norte');
    await userEvent.selectOptions(screen.getByLabelText('Zona horaria'), 'America/Tijuana');
    await userEvent.click(screen.getByRole('button', { name: 'Crear estancia' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'POST', '/administracion/estancias')).not.toBeNull());
    expect(bodyOf(fetchMock, 'POST', '/administracion/estancias')).toMatchObject({ code: 'ebdi-007', name: 'Estancia Siete', region: 'Norte', timeZone: 'America/Tijuana' });
    await waitFor(() => expect(screen.queryByLabelText('Clave EBDI')).toBeNull());
  });

  it('avisa junto a la clave cuando ya existe', async () => {
    vi.stubGlobal('fetch', routeFetch([], { 'POST /administracion/estancias': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'Ya existe una estancia con esa clave EBDI.' } }) }));
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva estancia' }));
    await userEvent.type(screen.getByLabelText('Clave EBDI'), 'EBDI-1');
    await userEvent.type(screen.getByLabelText('Nombre'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Crear estancia' }));
    expect(await screen.findByText('Ya existe una estancia con esa clave EBDI.')).toBeInTheDocument();
  });

  it('pide clave y nombre antes de enviar', async () => {
    const fetchMock = routeFetch([]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva estancia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear estancia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe la clave y el nombre de la estancia.');
    expect(bodyOf(fetchMock, 'POST', '/administracion/estancias')).toBeNull();
  });

  it('edita el nombre y la región sin tocar la clave', async () => {
    const fetchMock = routeFetch([estancia(1)], { 'PATCH /administracion/estancias/1': () => jsonResponse(200, estancia(1, { name: 'Renombrada' })) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    await userEvent.click(within(await rowOf('Estancia 1')).getByRole('button', { name: 'Editar Estancia 1' }));
    expect(screen.queryByLabelText('Clave EBDI')).toBeNull();
    const name = screen.getByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Renombrada');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/administracion/estancias/1')).not.toBeNull());
    expect(bodyOf(fetchMock, 'PATCH', '/administracion/estancias/1')).toMatchObject({ name: 'Renombrada' });
    expect(bodyOf(fetchMock, 'PATCH', '/administracion/estancias/1')).not.toHaveProperty('code');
  });

  it('desactiva una estancia activa y reactiva una inactiva', async () => {
    const fetchMock = routeFetch([estancia(1), estancia(2, { status: 'INACTIVA' })], {
      'PATCH /administracion/estancias/1': () => jsonResponse(200, estancia(1, { status: 'INACTIVA' })),
      'PATCH /administracion/estancias/2': () => jsonResponse(200, estancia(2)),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    await userEvent.click(within(await rowOf('Estancia 1')).getByRole('button', { name: 'Desactivar Estancia 1' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/administracion/estancias/1')).toEqual({ status: 'INACTIVA' }));
    await userEvent.click(within(await rowOf('Estancia 2')).getByRole('button', { name: 'Reactivar Estancia 2' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/administracion/estancias/2')).toEqual({ status: 'ACTIVA' }));
  });

  it('la baja pide confirmación y se puede cancelar', async () => {
    const fetchMock = routeFetch([estancia(1)], { 'POST /administracion/estancias/1/baja': () => new Response(null, { status: 204 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    await userEvent.click(within(await rowOf('Estancia 1')).getByRole('button', { name: 'Dar de baja Estancia 1' }));
    expect(screen.getByText(/La baja conserva el historial/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar baja' }));
    expect(screen.queryByText(/La baja conserva el historial/)).toBeNull();
    expect(bodyOf(fetchMock, 'POST', '/administracion/estancias/1/baja')).toBeNull();
    await userEvent.click(within(await rowOf('Estancia 1')).getByRole('button', { name: 'Dar de baja Estancia 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));
    await waitFor(() => expect(bodyOf(fetchMock, 'POST', '/administracion/estancias/1/baja')).not.toBeNull());
  });

  it('muestra por qué no se pudo dar de baja', async () => {
    vi.stubGlobal('fetch', routeFetch([estancia(1)], { 'POST /administracion/estancias/1/baja': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'La estancia tiene infantes con inscripción activa: muévelos o dalos de baja antes.' } }) }));
    renderWithSession(<EstanciasPage />, adminSession, '/app/administracion/estancias');
    await userEvent.click(within(await rowOf('Estancia 1')).getByRole('button', { name: 'Dar de baja Estancia 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La estancia tiene infantes con inscripción activa');
  });
});
