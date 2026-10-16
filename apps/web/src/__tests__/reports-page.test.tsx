import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage } from '../features/reports/pages/reports-page';
import { docenteSession, renderWithSession } from './test-utils';

const supervisorSession = {
  ...docenteSession,
  assignments: [{ role: 'SUPERVISOR_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  permissions: ['REPORTE_AGREGADO_CONSULTAR' as const],
};

const row = (id: number, name: string, light: string, rate: number | null, extra: Record<string, unknown> = {}) => ({
  estanciaId: id, code: `EBDI-${id}`, name, region: 'Norte', enrolled: 20, present: 18, absent: 1, other: 0, pending: 1, rate, light, ...extra,
});

const dashboard = (estancias: unknown[], date = '2026-10-15') => ({
  date,
  totals: { estancias: estancias.length, enrolled: 40, present: 30, absent: 8, other: 0, pending: 2, rate: 0.75, lights: { VERDE: 1, AMARILLO: 0, ROJO: 1, SIN_CAPTURA: 1 } },
  estancias,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const withData = (body: unknown) => vi.fn().mockResolvedValue(jsonResponse(200, body));

describe('ReportsPage (tablero semaforizado)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra los totales y el semáforo de cada estancia, con el color escrito y no solo pintado', async () => {
    vi.stubGlobal('fetch', withData(dashboard([row(1, 'Estancia Roja', 'ROJO', 0.5), row(2, 'Estancia Verde', 'VERDE', 0.95), row(3, 'Estancia Sin Captura', 'SIN_CAPTURA', null, { enrolled: 0, present: 0, absent: 0, pending: 0 })])));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    const red = (await screen.findByText('Estancia Roja')).closest('tr') as HTMLElement;
    expect(within(red).getByText('Rojo')).toBeInTheDocument();
    expect(within(red).getByText('50 %')).toBeInTheDocument();
    expect(within((await screen.findByText('Estancia Verde')).closest('tr') as HTMLElement).getByText('Verde')).toBeInTheDocument();
    const none = (await screen.findByText('Estancia Sin Captura')).closest('tr') as HTMLElement;
    expect(within(none).getByText('Sin captura')).toBeInTheDocument();
    expect(within(none).getByText('—')).toBeInTheDocument();
  });

  it('resume cuántas estancias hay en cada color y la asistencia global', async () => {
    vi.stubGlobal('fetch', withData(dashboard([row(1, 'Estancia Roja', 'ROJO', 0.5)])));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    const summary = await screen.findByRole('region', { name: 'Resumen' });
    expect(within(summary).getByText('75 %')).toBeInTheDocument();
    expect(within(summary).getByText('Rojo').parentElement).toHaveTextContent('1');
    expect(within(summary).getByText('Sin captura').parentElement).toHaveTextContent('1');
  });

  it('pide el tablero de la fecha elegida', async () => {
    const fetchMock = withData(dashboard([row(1, 'Estancia Roja', 'ROJO', 0.5)]));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    await screen.findByText('Estancia Roja');
    const date = screen.getByLabelText('Fecha');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-09-01');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('date=2026-09-01'))).toBe(true));
  });

  it('filtra las estancias por color', async () => {
    vi.stubGlobal('fetch', withData(dashboard([row(1, 'Estancia Roja', 'ROJO', 0.5), row(2, 'Estancia Verde', 'VERDE', 0.95)])));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    await screen.findByText('Estancia Verde');
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'ROJO');
    expect(screen.queryByText('Estancia Verde')).toBeNull();
    expect(screen.getByText('Estancia Roja')).toBeInTheDocument();
  });

  it('busca por nombre o clave de estancia', async () => {
    vi.stubGlobal('fetch', withData(dashboard([row(1, 'Estancia Roja', 'ROJO', 0.5), row(2, 'Estancia Verde', 'VERDE', 0.95)])));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    await screen.findByText('Estancia Verde');
    await userEvent.type(screen.getByLabelText('Buscar estancia'), 'ebdi-2');
    expect(screen.queryByText('Estancia Roja')).toBeNull();
    expect(screen.getByText('Estancia Verde')).toBeInTheDocument();
  });

  it('indica cuando el filtro no encuentra estancias', async () => {
    vi.stubGlobal('fetch', withData(dashboard([row(1, 'Estancia Roja', 'ROJO', 0.5)])));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    await screen.findByText('Estancia Roja');
    await userEvent.type(screen.getByLabelText('Buscar estancia'), 'zzz');
    expect(screen.getByText('Ninguna estancia coincide con el filtro')).toBeInTheDocument();
  });

  it('muestra un estado vacío cuando el alcance no tiene estancias', async () => {
    vi.stubGlobal('fetch', withData(dashboard([])));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    expect(await screen.findByText('Sin estancias para reportar')).toBeInTheDocument();
  });

  it('avisa si el tablero no carga', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } })));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el tablero.');
  });
});
