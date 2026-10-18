import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemsPage } from '../features/administration/pages/systems-page';
import { docenteSession, renderWithSession } from './test-utils';

const adminSession = {
  ...docenteSession,
  assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  permissions: ['SISTEMA_ADMINISTRAR' as const],
};

const system = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Sistema ${id}`,
  clientId: String(id).padStart(32, 'a'),
  scopes: ['REPORTE_AGREGADO_LEER'],
  status: 'ACTIVO',
  lastUsedAt: null,
  createdAt: '2026-10-18T12:00:00.000Z',
  revokedAt: null,
  ...overrides,
});

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
    .map(([, init]) => ((init as RequestInit).body === undefined ? null : JSON.parse(String((init as RequestInit).body))));

describe('pantalla de sistemas externos (RF-37)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista los sistemas con su identificador, alcances, estatus y último uso, sin ningún secreto', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /administracion/sistemas': () => jsonResponse(200, { systems: [system(1, { lastUsedAt: '2026-10-18T15:30:00.000Z' }), system(2, { status: 'REVOCADO', revokedAt: '2026-10-18T16:00:00.000Z' })] }) }));
    renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    expect(await screen.findByText('Sistema 1')).toBeInTheDocument();
    expect(screen.getByText(`${'a'.repeat(31)}1`)).toBeInTheDocument();
    expect(screen.getAllByText('Lectura de reportes agregados')).toHaveLength(2);
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Revocado')).toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).toBeNull();
    expect(screen.getAllByText('Nunca')).toHaveLength(1);
  });

  it('sin sistemas lo explica, y si falla la carga lo avisa', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /administracion/sistemas': () => jsonResponse(200, { systems: [] }) }));
    const { unmount } = renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    expect(await screen.findByText('Aún no hay sistemas registrados')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('fetch', routeFetch({ 'GET /administracion/sistemas': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la lista de sistemas.');
  });

  it('registra un sistema con nombre y alcances, y muestra el secreto una sola vez con el aviso', async () => {
    const created = { system: system(3, { name: 'Tablero institucional' }), clientSecret: 'sirai_secreto-de-prueba-0123456789' };
    const fetchMock = routeFetch({
      'GET /administracion/sistemas': () => jsonResponse(200, { systems: [] }),
      'POST /administracion/sistemas': () => jsonResponse(201, created),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    await user.click(await screen.findByRole('button', { name: 'Registrar sistema' }));
    await user.type(screen.getByLabelText('Nombre'), 'Tablero institucional');
    await user.click(screen.getByLabelText('Lectura de reportes agregados'));
    await user.click(screen.getByRole('button', { name: 'Crear sistema' }));
    await waitFor(() => expect(bodiesOf(fetchMock, '/administracion/sistemas')).toHaveLength(1));
    expect(bodiesOf(fetchMock, '/administracion/sistemas')[0]).toEqual({ name: 'Tablero institucional', scopes: ['REPORTE_AGREGADO_LEER'] });
    expect(await screen.findByText('sirai_secreto-de-prueba-0123456789')).toBeInTheDocument();
    expect(screen.getByText(/No se vuelve a mostrar/)).toBeInTheDocument();
    expect(screen.getByText(created.system.clientId)).toBeInTheDocument();
  });

  it('al cerrar el aviso el secreto desaparece de la pantalla y no vuelve', async () => {
    const created = { system: system(3), clientSecret: 'sirai_secreto-de-prueba-0123456789' };
    vi.stubGlobal('fetch', routeFetch({ 'GET /administracion/sistemas': () => jsonResponse(200, { systems: [system(3)] }), 'POST /administracion/sistemas': () => jsonResponse(201, created) }));
    const user = userEvent.setup();
    renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    await user.click(await screen.findByRole('button', { name: 'Registrar sistema' }));
    await user.type(screen.getByLabelText('Nombre'), 'Tablero');
    await user.click(screen.getByLabelText('Lectura de reportes agregados'));
    await user.click(screen.getByRole('button', { name: 'Crear sistema' }));
    await screen.findByText('sirai_secreto-de-prueba-0123456789');
    await user.click(screen.getByRole('button', { name: 'Ya guardé el secreto' }));
    expect(screen.queryByText('sirai_secreto-de-prueba-0123456789')).toBeNull();
    expect(screen.queryByText(/No se vuelve a mostrar/)).toBeNull();
  });

  it('exige nombre y al menos un alcance antes de llamar al servidor', async () => {
    const fetchMock = routeFetch({ 'GET /administracion/sistemas': () => jsonResponse(200, { systems: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    await user.click(await screen.findByRole('button', { name: 'Registrar sistema' }));
    await user.click(screen.getByRole('button', { name: 'Crear sistema' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el nombre del sistema.');
    await user.type(screen.getByLabelText('Nombre'), 'Tablero');
    await user.click(screen.getByRole('button', { name: 'Crear sistema' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige al menos un alcance.');
    expect(bodiesOf(fetchMock, '/administracion/sistemas')).toHaveLength(0);
  });

  it('muestra el rechazo del servidor al registrar', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /administracion/sistemas': () => jsonResponse(200, { systems: [] }), 'POST /administracion/sistemas': () => jsonResponse(400, { error: { code: 'DATOS_INVALIDOS', message: 'Datos inválidos.' } }) }));
    const user = userEvent.setup();
    renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    await user.click(await screen.findByRole('button', { name: 'Registrar sistema' }));
    await user.type(screen.getByLabelText('Nombre'), 'Tablero');
    await user.click(screen.getByLabelText('Lectura de reportes agregados'));
    await user.click(screen.getByRole('button', { name: 'Crear sistema' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos.');
  });

  it('revocar pide confirmación explícita y solo se ofrece a los sistemas activos', async () => {
    const fetchMock = routeFetch({
      'GET /administracion/sistemas': () => jsonResponse(200, { systems: [system(1), system(2, { status: 'REVOCADO', revokedAt: '2026-10-18T16:00:00.000Z' })] }),
      'POST /administracion/sistemas/1/revocar': () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<SystemsPage />, adminSession, '/app/administracion/sistemas');
    await screen.findByText('Sistema 1');
    expect(screen.queryByRole('button', { name: 'Revocar Sistema 2' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Revocar Sistema 1' }));
    expect(screen.getByText(/Dejará de poder pedir tokens y los que ya tiene dejarán de funcionar/)).toBeInTheDocument();
    expect(bodiesOf(fetchMock, '/administracion/sistemas/1/revocar')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Cancelar revocación' }));
    expect(screen.queryByText(/Dejará de poder pedir tokens/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Revocar Sistema 1' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar revocación' }));
    await waitFor(() => expect(bodiesOf(fetchMock, '/administracion/sistemas/1/revocar')).toHaveLength(1));
  });
});
