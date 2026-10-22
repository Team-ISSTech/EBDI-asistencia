import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RollCallPage } from '../features/attendance/pages/roll-call-page';
import { docenteSession, renderWithSession } from './test-utils';

const TODAY = new Date().toLocaleDateString('en-CA');

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'JORNADA_CERRAR' as const],
};
const readOnlySession = {
  ...docenteSession,
  assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: ['ASISTENCIA_CONSULTAR' as const],
};

const journey = { id: 3, estanciaId: 1, date: TODAY, shift: 'MATUTINO', status: 'ABIERTA', openedAt: '2026-10-15T13:00:00.000Z', closedAt: null };

const entry = (n: number, status: string | null = null, medicalLock = false) => ({
  enrollmentId: n,
  childId: n,
  childName: `Infante ${n} Prueba`,
  enrollmentNumber: `M-${n}`,
  roomId: 1,
  roomName: 'Lactantes (prueba)',
  status,
  medicalLock,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const notFound = () => jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'No hay una jornada abierta para esa fecha y turno.' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    const handler = handlers[`${init?.method ?? 'GET'} ${parsed.pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const withJourney = (entries: unknown[], extra: Record<string, () => Response> = {}) =>
  routeFetch({
    'GET /asistencia/jornadas/activa': () => jsonResponse(200, journey),
    'GET /asistencia/jornadas/3/lista': () => jsonResponse(200, { entries }),
    ...extra,
  });

const postedMarks = (fetchMock: ReturnType<typeof routeFetch>): Array<{ enrollmentId: number; status: string; clientId: string }> => {
  const call = fetchMock.mock.calls.find(([url, init]) => new URL(url).pathname.endsWith('/registros') && (init as RequestInit | undefined)?.method === 'POST');
  return call ? JSON.parse(String((call[1] as RequestInit).body)).marks : [];
};

const rowOf = async (name: string): Promise<HTMLElement> => {
  const row = (await screen.findByText(name)).closest('tr');
  if (!row) throw new Error(`Sin fila para ${name}`);
  return row;
};

describe('RollCallPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin jornada abierta, quien no puede abrirla lo ve explicado', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /asistencia/jornadas/activa': notFound }));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    expect(await screen.findByText('Todavía no hay jornada abierta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir jornada' })).toBeNull();
  });

  it('la directora abre la jornada de hoy con un clic', async () => {
    const fetchMock = routeFetch({
      'GET /asistencia/jornadas/activa': notFound,
      'POST /asistencia/jornadas': () => jsonResponse(201, journey),
      'GET /asistencia/jornadas/3/lista': () => jsonResponse(200, { entries: [entry(1)] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RollCallPage />, directoraSession, '/app/pase-de-lista');
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir jornada' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ date: TODAY, shift: 'MATUTINO' });
  });

  it('muestra la lista del turno con el estado de cada infante', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1, 'PRESENTE'), entry(2)]));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    expect(within(await rowOf('Infante 1 Prueba')).getByRole('button', { name: 'Presente', pressed: true })).toBeInTheDocument();
    expect(within(await rowOf('Infante 2 Prueba')).queryByRole('button', { pressed: true })).toBeNull();
  });

  it('cada fila es un control segmentado: texto corto a la vista, nombre completo para lectores y el estado elegido con su color', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1, 'COMISION_MEDICA'), entry(2, null, true)]));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    const first = within(await rowOf('Infante 1 Prueba')).getByRole('group', { name: 'Asistencia de Infante 1 Prueba' });
    const visible = within(first).getAllByRole('button').map((button) => [button.textContent, button.getAttribute('aria-label') ?? button.textContent, button.title]);
    expect(visible).toEqual([
      ['Presente', 'Presente', 'Presente'],
      ['Justificado', 'Ausente justificado', 'Ausente justificado'],
      ['Falta', 'Falta injustificada', 'Falta injustificada'],
      ['Comisión', 'Comisión médica', 'Comisión médica'],
      ['Filtro', 'Filtro sanitario', 'Filtro sanitario'],
    ]);
    const comision = within(first).getByRole('button', { name: 'Comisión médica', pressed: true });
    expect(comision).toHaveClass('bg-[var(--color-comision-medica)]', 'text-white');
    await userEvent.click(within(first).getByRole('button', { name: 'Falta injustificada' }));
    expect(within(first).getByRole('button', { name: 'Falta injustificada', pressed: true })).toHaveClass('bg-[var(--color-falta-injustificada)]');
    expect(within(first).getByRole('button', { name: 'Comisión médica', pressed: false })).not.toHaveClass('bg-[var(--color-comision-medica)]');
    const locked = within(await rowOf('Infante 2 Prueba')).getByRole('group');
    expect(within(locked).getByRole('button', { name: 'Presente' })).toBeDisabled();
    expect(within(locked).getByRole('button', { name: 'Falta injustificada' })).toBeEnabled();
  });

  it('pasar lista a todo el grupo toma dos clics: marcar a todos presentes y guardar', async () => {
    const fetchMock = withJourney([entry(1), entry(2), entry(3)], { 'POST /asistencia/jornadas/3/registros': () => jsonResponse(200, { saved: 3, unchanged: 0 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await waitFor(() => expect(postedMarks(fetchMock)).toHaveLength(3));
    const marks = postedMarks(fetchMock);
    expect(marks.map((m) => m.status)).toEqual(['PRESENTE', 'PRESENTE', 'PRESENTE']);
    expect(new Set(marks.map((m) => m.clientId)).size).toBe(3);
    expect(marks.every((m) => /^[0-9a-f-]{36}$/.test(m.clientId))).toBe(true);
  });

  it('las excepciones se marcan con un clic cada una y solo se envía lo cambiado', async () => {
    const fetchMock = withJourney([entry(1, 'PRESENTE'), entry(2), entry(3)], { 'POST /asistencia/jornadas/3/registros': () => jsonResponse(200, { saved: 2, unchanged: 0 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await userEvent.click(within(await rowOf('Infante 3 Prueba')).getByRole('button', { name: 'Falta injustificada' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await waitFor(() => expect(postedMarks(fetchMock)).toHaveLength(2));
    expect(postedMarks(fetchMock).map((m) => [m.enrollmentId, m.status])).toEqual([[2, 'PRESENTE'], [3, 'FALTA_INJUSTIFICADA']]);
  });

  it('marcar a todos presentes respeta a quienes ya tienen estado', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1, 'FILTRO_SANITARIO'), entry(2)]));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    expect(within(await rowOf('Infante 1 Prueba')).getByRole('button', { name: 'Filtro sanitario', pressed: true })).toBeInTheDocument();
    expect(within(await rowOf('Infante 2 Prueba')).getByRole('button', { name: 'Presente', pressed: true })).toBeInTheDocument();
  });

  it('no hay nada que guardar hasta que haya cambios', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1, 'PRESENTE')]));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    expect(await screen.findByRole('button', { name: 'Guardar asistencia' })).toBeDisabled();
  });

  it('avisa si no se pudo guardar y conserva lo marcado', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1)], { 'POST /asistencia/jornadas/3/registros': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la asistencia.');
    expect(within(await rowOf('Infante 1 Prueba')).getByRole('button', { name: 'Presente', pressed: true })).toBeInTheDocument();
  });

  it('quien solo consulta ve la lista sin controles de captura', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1, 'PRESENTE')]));
    renderWithSession(<RollCallPage />, readOnlySession, '/app/pase-de-lista');
    await rowOf('Infante 1 Prueba');
    expect(screen.queryByRole('button', { name: 'Marcar a todos presentes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Falta injustificada' })).toBeNull();
    expect(screen.getByText('Presente')).toBeInTheDocument();
  });

  it('la directora cierra la jornada', async () => {
    const fetchMock = withJourney([entry(1, 'PRESENTE')], { 'POST /asistencia/jornadas/3/cierre': () => jsonResponse(201, { ...journey, status: 'CERRADA', closedAt: '2026-10-15T20:00:00.000Z' }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RollCallPage />, directoraSession, '/app/pase-de-lista');
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar jornada' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/cierre'))).toBe(true));
  });

  it('cambiar de turno busca la jornada de ese turno', async () => {
    const fetchMock = routeFetch({ 'GET /asistencia/jornadas/activa': notFound });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await screen.findByText('Todavía no hay jornada abierta');
    await userEvent.selectOptions(screen.getByLabelText('Turno'), 'VESPERTINO');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('shift=VESPERTINO'))).toBe(true));
  });

  it('avisa si la lista no carga', async () => {
    vi.stubGlobal('fetch', withJourney([], { 'GET /asistencia/jornadas/3/lista': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la lista de asistencia.');
  });

  it('un infante con candado médico muestra el aviso y no se puede marcar presente', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1), entry(2, null, true)]));
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    const locked = within(await rowOf('Infante 2 Prueba'));
    expect(locked.getByText('Requiere alta médica')).toBeInTheDocument();
    expect(locked.getByRole('button', { name: 'Presente' })).toBeDisabled();
    expect(locked.getByRole('button', { name: 'Falta injustificada' })).toBeEnabled();
    expect(within(await rowOf('Infante 1 Prueba')).queryByText('Requiere alta médica')).toBeNull();
  });

  it('marcar a todos presentes se salta a quien tiene candado médico', async () => {
    const fetchMock = withJourney([entry(1), entry(2, null, true)], { 'POST /asistencia/jornadas/3/registros': () => jsonResponse(200, { saved: 1, unchanged: 0 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await waitFor(() => expect(postedMarks(fetchMock)).toHaveLength(1));
    expect(postedMarks(fetchMock).map((m) => m.enrollmentId)).toEqual([1]);
  });

  it('quien solo consulta también ve el aviso de candado médico', async () => {
    vi.stubGlobal('fetch', withJourney([entry(1, null, true)]));
    renderWithSession(<RollCallPage />, readOnlySession, '/app/pase-de-lista');
    expect(within(await rowOf('Infante 1 Prueba')).getByText('Requiere alta médica')).toBeInTheDocument();
  });
});
