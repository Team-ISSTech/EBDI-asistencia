import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchoolYearsPage } from '../features/administration/pages/school-years-page';
import { docenteSession, renderWithSession } from './test-utils';

const adminSession = {
  ...docenteSession,
  assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  permissions: ['CICLO_ADMINISTRAR' as const],
};

const year = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  code: `Ciclo-${id}`,
  startDate: '2025-08-25',
  endDate: '2026-07-15',
  status: 'ARCHIVADO',
  archivedAt: '2026-07-16T10:00:00.000Z',
  purgeEligibleOn: '2031-07-16T10:00:00.000Z',
  purgedAt: null,
  canPurge: false,
  usage: null,
  ...overrides,
});

const active = (usage = { openJourneys: 0, openFollowUps: 0 }) => year(9, { code: '2026-2027', status: 'ACTIVO', archivedAt: null, purgeEligibleOn: null, usage });

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

const list = (years: unknown[]) => ({ 'GET /administracion/ciclos': () => jsonResponse(200, { schoolYears: years }) });
const rowOf = async (code: string): Promise<HTMLElement> => (await screen.findByText(code, { selector: 'p' })).closest('tr') as HTMLElement;

describe('pantalla de ciclos escolares (RNF-05)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra el ciclo activo con lo que impide cerrarlo, y los archivados con desde cuándo se depuran', async () => {
    vi.stubGlobal('fetch', routeFetch(list([active({ openJourneys: 2, openFollowUps: 1 }), year(3), year(2, { status: 'ARCHIVADO', canPurge: true }), year(1, { purgedAt: '2026-01-01T00:00:00.000Z' })])));
    renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
    const current = await rowOf('2026-2027');
    expect(within(current).getByText('Activo')).toBeInTheDocument();
    expect(within(current).getByText(/2 jornadas abiertas/)).toBeInTheDocument();
    expect(within(current).getByText(/1 seguimiento sin cerrar/)).toBeInTheDocument();
    const archived = await rowOf('Ciclo-3');
    expect(within(archived).getByText('Archivado')).toBeInTheDocument();
    expect(within(archived).getByText(/Se puede depurar desde/)).toBeInTheDocument();
    expect(within(await rowOf('Ciclo-1')).getByText('Depurado')).toBeInTheDocument();
  });

  it('muestra las fechas del ciclo tal como se capturaron, también en una zona horaria al oeste de UTC', async () => {
    const machineZone = process.env['TZ'];
    process.env['TZ'] = 'America/Mexico_City';
    try {
      vi.stubGlobal('fetch', routeFetch(list([active(), year(3, { startDate: '2025-08-01', endDate: '2026-07-31' })])));
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      expect(within(await rowOf('2026-2027')).getByText('25/8/2025 a 15/7/2026')).toBeInTheDocument();
      expect(within(await rowOf('Ciclo-3')).getByText('1/8/2025 a 31/7/2026')).toBeInTheDocument();
    } finally {
      if (machineZone === undefined) delete process.env['TZ'];
      else process.env['TZ'] = machineZone;
    }
  });

  it('con todo cerrado, el ciclo activo lo dice', async () => {
    vi.stubGlobal('fetch', routeFetch(list([active()])));
    renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
    expect(within(await rowOf('2026-2027')).getByText('Todo cerrado: se puede cerrar el ciclo.')).toBeInTheDocument();
  });

  it('sin ciclos explica cómo empezar, y si falla la carga lo avisa', async () => {
    vi.stubGlobal('fetch', routeFetch(list([])));
    const { unmount } = renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
    expect(await screen.findByText('Aún no hay ciclos escolares')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('fetch', routeFetch({ 'GET /administracion/ciclos': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la lista de ciclos.');
  });

  describe('abrir un ciclo nuevo', () => {
    it('advierte que cierra el actual y manda clave y fechas', async () => {
      const fetchMock = routeFetch({ ...list([active()]), 'POST /administracion/ciclos': () => jsonResponse(201, active()) });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      await user.click(await screen.findByRole('button', { name: 'Abrir ciclo nuevo' }));
      expect(screen.getByText(/archiva el ciclo actual, que queda de solo lectura/)).toBeInTheDocument();
      await user.type(screen.getByLabelText('Clave'), '2027-2028');
      await user.type(screen.getByLabelText('Inicio'), '2027-08-23');
      await user.type(screen.getByLabelText('Fin'), '2028-07-14');
      await user.click(screen.getByRole('button', { name: 'Archivar el actual y abrir este' }));
      await waitFor(() => expect(bodiesOf(fetchMock, '/administracion/ciclos')).toHaveLength(1));
      expect(bodiesOf(fetchMock, '/administracion/ciclos')[0]).toEqual({ code: '2027-2028', startDate: '2027-08-23', endDate: '2028-07-14' });
      await waitFor(() => expect(screen.queryByLabelText('Clave')).toBeNull());
    });

    it('valida sin llamar al servidor: clave y fechas obligatorias, y fin no anterior al inicio', async () => {
      const fetchMock = routeFetch(list([active()]));
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      await user.click(await screen.findByRole('button', { name: 'Abrir ciclo nuevo' }));
      await user.click(screen.getByRole('button', { name: 'Archivar el actual y abrir este' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Escribe la clave del ciclo.');
      await user.type(screen.getByLabelText('Clave'), '2027-2028');
      await user.click(screen.getByRole('button', { name: 'Archivar el actual y abrir este' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Indica cuándo empieza y cuándo termina el ciclo.');
      await user.type(screen.getByLabelText('Inicio'), '2028-01-01');
      await user.type(screen.getByLabelText('Fin'), '2027-01-01');
      await user.click(screen.getByRole('button', { name: 'Archivar el actual y abrir este' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('El fin del ciclo no puede ser anterior a su inicio.');
      expect(bodiesOf(fetchMock, '/administracion/ciclos')).toHaveLength(0);
    });

    it('muestra el motivo del servidor, por ejemplo jornadas abiertas', async () => {
      vi.stubGlobal('fetch', routeFetch({ ...list([active({ openJourneys: 1, openFollowUps: 0 })]), 'POST /administracion/ciclos': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'No se puede cerrar el ciclo 2026-2027: tiene 1 jornada abierta.' } }) }));
      const user = userEvent.setup();
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      await user.click(await screen.findByRole('button', { name: 'Abrir ciclo nuevo' }));
      await user.type(screen.getByLabelText('Clave'), '2027-2028');
      await user.type(screen.getByLabelText('Inicio'), '2027-08-23');
      await user.type(screen.getByLabelText('Fin'), '2028-07-14');
      await user.click(screen.getByRole('button', { name: 'Archivar el actual y abrir este' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('tiene 1 jornada abierta');
    });
  });

  describe('depurar', () => {
    const withEligible = () => list([active(), year(2, { code: '2019-2020', canPurge: true }), year(3)]);

    it('solo se ofrece a los ciclos que ya cumplieron los 5 años', async () => {
      vi.stubGlobal('fetch', routeFetch(withEligible()));
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      await rowOf('2019-2020');
      expect(screen.getByRole('button', { name: 'Depurar el ciclo 2019-2020' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Depurar el ciclo Ciclo-3' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Depurar el ciclo 2026-2027' })).toBeNull();
    });

    it('advierte que es irreversible y no deja confirmar hasta escribir la clave del ciclo', async () => {
      const fetchMock = routeFetch({ ...withEligible(), 'POST /administracion/ciclos/2/depurar': () => jsonResponse(200, { contacts: 4, releases: 2 }) });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      await user.click(await screen.findByRole('button', { name: 'Depurar el ciclo 2019-2020' }));
      expect(screen.getByText(/no se puede deshacer/)).toBeInTheDocument();
      expect(screen.getByText(/teléfonos, notas de asesoría y observaciones médicas/)).toBeInTheDocument();
      const confirm = screen.getByRole('button', { name: 'Confirmar depuración' });
      expect(confirm).toBeDisabled();
      await user.type(screen.getByLabelText('Escribe la clave del ciclo para confirmar'), '2019-2021');
      expect(confirm).toBeDisabled();
      await user.clear(screen.getByLabelText('Escribe la clave del ciclo para confirmar'));
      await user.type(screen.getByLabelText('Escribe la clave del ciclo para confirmar'), '2019-2020');
      expect(confirm).toBeEnabled();
      expect(bodiesOf(fetchMock, '/administracion/ciclos/2/depurar')).toHaveLength(0);
      await user.click(confirm);
      await waitFor(() => expect(bodiesOf(fetchMock, '/administracion/ciclos/2/depurar')).toHaveLength(1));
      expect(bodiesOf(fetchMock, '/administracion/ciclos/2/depurar')[0]).toEqual({ confirmCode: '2019-2020' });
      expect(await screen.findByRole('status')).toHaveTextContent('Se vaciaron los datos sensibles de 4 contactos y 2 altas médicas.');
    });

    it('cancelar cierra la confirmación sin llamar al servidor', async () => {
      const fetchMock = routeFetch(withEligible());
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      await user.click(await screen.findByRole('button', { name: 'Depurar el ciclo 2019-2020' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar depuración' }));
      expect(screen.queryByText(/no se puede deshacer/)).toBeNull();
      expect(bodiesOf(fetchMock, '/administracion/ciclos/2/depurar')).toHaveLength(0);
    });

    it('muestra el rechazo del servidor', async () => {
      vi.stubGlobal('fetch', routeFetch({ ...withEligible(), 'POST /administracion/ciclos/2/depurar': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'El ciclo 2019-2020 ya se depuró.' } }) }));
      const user = userEvent.setup();
      renderWithSession(<SchoolYearsPage />, adminSession, '/app/administracion/ciclos');
      await user.click(await screen.findByRole('button', { name: 'Depurar el ciclo 2019-2020' }));
      await user.type(screen.getByLabelText('Escribe la clave del ciclo para confirmar'), '2019-2020');
      await user.click(screen.getByRole('button', { name: 'Confirmar depuración' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('ya se depuró');
    });
  });
});
