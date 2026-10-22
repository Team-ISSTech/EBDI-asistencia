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

  it('por estancia, presentes, ausentes, otros (comisión médica y filtro sanitario) y pendientes suman los inscritos', async () => {
    vi.stubGlobal('fetch', withData(dashboard([
      row(1, 'Estancia Amarilla', 'AMARILLO', 0.6, { enrolled: 20, present: 12, absent: 3, other: 4, pending: 1 }),
      row(2, 'Estancia Verde', 'VERDE', 0.9, { enrolled: 30, present: 27, absent: 1, other: 2, pending: 0 }),
    ])));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    const table = (await screen.findByText('Estancia Amarilla')).closest('table') as HTMLElement;
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    const valueOf = (name: string, column: string): number => {
      const cells = within(within(table).getByText(name).closest('tr') as HTMLElement).getAllByRole('cell');
      return Number(cells[headers.findIndex((header) => header.startsWith(column))]?.textContent);
    };
    for (const [name, other] of [['Estancia Amarilla', 4], ['Estancia Verde', 2]] as const) {
      expect(valueOf(name, 'Otros')).toBe(other);
      expect(valueOf(name, 'Presentes') + valueOf(name, 'Ausentes') + valueOf(name, 'Otros') + valueOf(name, 'Pendientes')).toBe(valueOf(name, 'Inscritos'));
    }
    expect(screen.getByText(/Otros: comisión médica y filtro sanitario/)).toBeInTheDocument();
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

describe('ReportsPage: exportación (RF-17)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  /** jsdom no implementa las URL de objetos: se definen para la prueba y se quitan al terminar. */
  const setupDownload = () => {
    const created: Blob[] = [];
    const click = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((blob: Blob) => { created.push(blob); return 'blob:reporte'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
    const originalCreate = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const element = originalCreate(tag, options);
      if (tag === 'a') {
        anchors.push(element as HTMLAnchorElement);
        (element as HTMLAnchorElement).click = click;
      }
      return element;
    });
    return { created, click, anchors };
  };

  const fetchFor = (exportResponse: () => Response) =>
    vi.fn((url: string) => Promise.resolve(String(url).includes('/reportes/exportacion') ? exportResponse() : jsonResponse(200, dashboard([row(1, 'Estancia Roja', 'ROJO', 0.5)]))));

  const excelFile = () => new Response('xlsx', { status: 200, headers: { 'content-disposition': 'attachment; filename="sirai-asistencia-mensual.xlsx"' } });

  it('descarga el corte mensual en Excel de la fecha elegida', async () => {
    const { click, anchors } = setupDownload();
    const fetchMock = fetchFor(excelFile);
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    await screen.findByText('Estancia Roja');
    await userEvent.selectOptions(screen.getByLabelText('Corte'), 'MONTH');
    await userEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const url = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes('/reportes/exportacion')) ?? '';
    expect(url).toMatch(/period=MONTH/);
    expect(url).toMatch(/format=xlsx/);
    expect(url).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    expect(anchors.at(-1)?.download).toBe('sirai-asistencia-mensual.xlsx');
  });

  it('descarga el PDF', async () => {
    const { click } = setupDownload();
    const fetchMock = fetchFor(() => new Response('pdf', { status: 200, headers: { 'content-disposition': 'attachment; filename="r.pdf"' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    await screen.findByText('Estancia Roja');
    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetchMock.mock.calls.map(([u]) => String(u)).some((u) => u.includes('format=pdf') && u.includes('period=DAY'))).toBe(true);
  });

  it('avisa si no se pudo descargar', async () => {
    setupDownload();
    vi.stubGlobal('fetch', fetchFor(() => jsonResponse(403, { error: { code: 'SIN_PERMISO', message: 'No' } })));
    renderWithSession(<ReportsPage />, supervisorSession, '/app/reportes');
    await screen.findByText('Estancia Roja');
    await userEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo descargar el reporte.');
  });
});
