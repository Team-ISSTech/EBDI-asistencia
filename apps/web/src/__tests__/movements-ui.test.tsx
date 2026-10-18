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

const rooms = {
  rooms: [
    { id: 7, estanciaId: 1, name: 'Lactantes (prueba)', shift: 'MATUTINO', minAgeMonths: 0, maxAgeMonths: 18, capacity: 12, status: 'ACTIVO' },
    { id: 8, estanciaId: 1, name: 'Maternal (prueba)', shift: 'MATUTINO', minAgeMonths: 12, maxAgeMonths: 36, capacity: 12, status: 'ACTIVO' },
  ],
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

const base = {
  'GET /infantes': () => jsonResponse(200, { children: [child] }),
  'GET /salas': () => jsonResponse(200, rooms),
  'GET /traslados/destinos': () => jsonResponse(200, { estancias: [{ id: 2, code: 'EBDI-002', name: 'Estancia Dos' }] }),
};

describe('movimientos de inscripción (RF-35)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('una docente no ve movimientos ni traslados pendientes', async () => {
    vi.stubGlobal('fetch', routeFetch(base));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    await screen.findByText('Infante Prueba');
    expect(screen.queryByRole('button', { name: /Movimientos de Infante/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Traslados pendientes' })).not.toBeInTheDocument();
  });

  it('cambio de sala: elige la sala nueva y manda el cuerpo exacto', async () => {
    const fetchMock = routeFetch({ ...base, 'POST /infantes/1/movimientos': () => new Response(null, { status: 204 }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Movimientos de Infante Prueba' }));
    await user.selectOptions(await screen.findByLabelText('Sala nueva'), '8');
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'POST', '/infantes/1/movimientos')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'POST', '/infantes/1/movimientos')[0]).toEqual({ type: 'CAMBIO_SALA', roomId: 8, reason: null });
  });

  it('la sala actual no se ofrece como destino', async () => {
    vi.stubGlobal('fetch', routeFetch(base));
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Movimientos de Infante Prueba' }));
    const select = await screen.findByLabelText('Sala nueva');
    expect(select).not.toHaveTextContent('Lactantes (prueba)');
    expect(select).toHaveTextContent('Maternal (prueba)');
  });

  it('baja: pide el motivo antes de llamar a la API', async () => {
    const fetchMock = routeFetch({ ...base, 'POST /infantes/1/movimientos': () => new Response(null, { status: 204 }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Movimientos de Infante Prueba' }));
    await user.selectOptions(screen.getByLabelText('Movimiento'), 'BAJA');
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el motivo.');
    expect(bodiesOf(fetchMock, 'POST', '/infantes/1/movimientos')).toHaveLength(0);
    await user.type(screen.getByLabelText('Motivo'), 'Cambio de domicilio');
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'POST', '/infantes/1/movimientos')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'POST', '/infantes/1/movimientos')[0]).toEqual({ type: 'BAJA', reason: 'Cambio de domicilio' });
  });

  it('traslado: elige la estancia de destino y escribe el motivo', async () => {
    const fetchMock = routeFetch({ ...base, 'POST /infantes/1/movimientos': () => new Response(null, { status: 204 }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Movimientos de Infante Prueba' }));
    await user.selectOptions(screen.getByLabelText('Movimiento'), 'TRASLADO');
    await user.selectOptions(await screen.findByLabelText('Estancia de destino'), '2');
    await user.type(screen.getByLabelText('Motivo'), 'Mudanza');
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'POST', '/infantes/1/movimientos')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'POST', '/infantes/1/movimientos')[0]).toEqual({ type: 'TRASLADO', destinationEstanciaId: 2, reason: 'Mudanza' });
  });

  it('muestra el rechazo del servidor, por ejemplo una sala llena', async () => {
    vi.stubGlobal('fetch', routeFetch({ ...base, 'POST /infantes/1/movimientos': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'La sala está llena.' } }) }));
    const user = userEvent.setup();
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Movimientos de Infante Prueba' }));
    await user.selectOptions(await screen.findByLabelText('Sala nueva'), '8');
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La sala está llena.');
  });

  describe('recepción de traslados', () => {
    const transfer = { enrollmentId: 9, childName: 'Ana Pérez', enrollmentNumber: 'M-77', birthDate: '2025-01-01', fromEstanciaName: 'Estancia Origen', movedAt: '2026-10-17T10:00:00.000Z', reason: 'Mudanza' };

    it('lista los traslados pendientes y recibe al infante en la sala elegida', async () => {
      const fetchMock = routeFetch({
        ...base,
        'GET /traslados/pendientes': () => jsonResponse(200, { transfers: [transfer] }),
        'POST /traslados/9/recepcion': () => new Response(null, { status: 204 }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
      expect(fetchMock.mock.calls.some(([url]) => new URL(url).pathname === '/traslados/pendientes')).toBe(false);
      await user.click(await screen.findByRole('button', { name: 'Traslados pendientes' }));
      expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
      expect(screen.getByText(/Estancia Origen/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recibir a Ana Pérez' })).toBeDisabled();
      await user.selectOptions(screen.getByLabelText('Sala para Ana Pérez'), '8');
      await user.click(screen.getByRole('button', { name: 'Recibir a Ana Pérez' }));
      await waitFor(() => expect(bodiesOf(fetchMock, 'POST', '/traslados/9/recepcion')).toHaveLength(1));
      expect(bodiesOf(fetchMock, 'POST', '/traslados/9/recepcion')[0]).toEqual({ roomId: 8 });
    });

    it('sin traslados pendientes lo dice, y si falla avisa', async () => {
      vi.stubGlobal('fetch', routeFetch({ ...base, 'GET /traslados/pendientes': () => jsonResponse(200, { transfers: [] }) }));
      const user = userEvent.setup();
      const { unmount } = renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
      await user.click(await screen.findByRole('button', { name: 'Traslados pendientes' }));
      expect(await screen.findByText('No hay traslados por recibir')).toBeInTheDocument();
      unmount();
      vi.stubGlobal('fetch', routeFetch({ ...base, 'GET /traslados/pendientes': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
      renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
      await user.click(await screen.findByRole('button', { name: 'Traslados pendientes' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los traslados.');
    });
  });
});
