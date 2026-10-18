import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RollCallPage } from '../features/attendance/pages/roll-call-page';
import { docenteSession, renderWithSession } from './test-utils';

const TODAY = new Date().toLocaleDateString('en-CA');
const journey = { id: 3, estanciaId: 1, date: TODAY, shift: 'MATUTINO', status: 'ABIERTA', openedAt: '2026-10-15T13:00:00.000Z', closedAt: null };
const readOnlySession = {
  ...docenteSession,
  assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: ['ASISTENCIA_CONSULTAR' as const],
};

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

const withRoster = (entries: unknown[]) =>
  vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const handlers: Record<string, () => Response> = {
      'GET /asistencia/jornadas/activa': () => jsonResponse(200, journey),
      'GET /asistencia/jornadas/3/lista': () => jsonResponse(200, { entries }),
      'POST /asistencia/jornadas/3/registros': () => jsonResponse(200, { saved: 1, unchanged: 0 }),
    };
    return Promise.resolve(handlers[key]?.() ?? jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const postedMarks = (fetchMock: ReturnType<typeof withRoster>): Array<{ enrollmentId: number; status: string; method: string }> => {
  const call = fetchMock.mock.calls.find(([url, init]) => new URL(url).pathname.endsWith('/registros') && (init as RequestInit | undefined)?.method === 'POST');
  return call ? JSON.parse(String((call[1] as RequestInit).body)).marks : [];
};

const scanBox = () => screen.findByLabelText('Escanear o escribir matrícula');

describe('escaneo en el pase de lista (RF-13)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'BarcodeDetector');
  });

  it('un lector que escribe la matrícula y manda Enter marca presente y avisa a quién', async () => {
    vi.stubGlobal('fetch', withRoster([entry(1), entry(2)]));
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), 'M-2{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Infante 2 Prueba: presente');
    const row = (await screen.findByText('Infante 2 Prueba', { selector: 'p' })).closest('tr') as HTMLElement;
    expect(within(row).getByRole('button', { name: 'Presente', pressed: true })).toBeInTheDocument();
    expect(scanBoxValue()).toBe('');
  });

  const scanBoxValue = () => (screen.getByLabelText('Escanear o escribir matrícula') as HTMLInputElement).value;

  it('guarda lo escaneado con método QR y lo marcado a mano con MANUAL', async () => {
    const fetchMock = withRoster([entry(1), entry(2)]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), 'M-2{Enter}');
    const row = (await screen.findByText('Infante 1 Prueba', { selector: 'p' })).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Falta injustificada' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await waitFor(() => expect(postedMarks(fetchMock)).toHaveLength(2));
    expect(postedMarks(fetchMock).map((m) => [m.enrollmentId, m.status, m.method])).toEqual([
      [2, 'PRESENTE', 'QR'],
      [1, 'FALTA_INJUSTIFICADA', 'MANUAL'],
    ]);
  });

  it('ignora mayúsculas y espacios alrededor de la matrícula', async () => {
    vi.stubGlobal('fetch', withRoster([entry(7)]));
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), '  m-7  {Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Infante 7 Prueba: presente');
  });

  it('una matrícula que no está en el turno avisa y no marca nada', async () => {
    vi.stubGlobal('fetch', withRoster([entry(1)]));
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), 'ZZZ-9{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay un infante con la matrícula ZZZ-9 en este turno.');
    expect(screen.getByRole('button', { name: 'Guardar asistencia' })).toBeDisabled();
  });

  it('un código vacío no hace nada', async () => {
    vi.stubGlobal('fetch', withRoster([entry(1)]));
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), '   {Enter}');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('quien ya estaba presente se avisa sin volver a marcarlo', async () => {
    vi.stubGlobal('fetch', withRoster([entry(1, 'PRESENTE')]));
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), 'M-1{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Infante 1 Prueba ya estaba presente');
    expect(screen.getByRole('button', { name: 'Guardar asistencia' })).toBeDisabled();
  });

  it('escanear dos veces al mismo infante lo marca una sola vez', async () => {
    const fetchMock = withRoster([entry(1)]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), 'M-1{Enter}');
    await user.type(screen.getByLabelText('Escanear o escribir matrícula'), 'M-1{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Infante 1 Prueba ya estaba presente');
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await waitFor(() => expect(postedMarks(fetchMock)).toHaveLength(1));
  });

  it('con candado médico no se marca presente y se explica', async () => {
    vi.stubGlobal('fetch', withRoster([entry(1, null, true)]));
    const user = userEvent.setup();
    renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
    await user.type(await scanBox(), 'M-1{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Infante 1 Prueba requiere alta médica: no se puede marcar presente.');
    expect(screen.getByRole('button', { name: 'Guardar asistencia' })).toBeDisabled();
  });

  it('quien solo consulta no ve el escaneo', async () => {
    vi.stubGlobal('fetch', withRoster([entry(1)]));
    renderWithSession(<RollCallPage />, readOnlySession, '/app/pase-de-lista');
    await screen.findByText('Infante 1 Prueba');
    expect(screen.queryByLabelText('Escanear o escribir matrícula')).toBeNull();
  });

  describe('cámara', () => {
    it('sin soporte del navegador no se ofrece', async () => {
      vi.stubGlobal('fetch', withRoster([entry(1)]));
      renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
      await scanBox();
      expect(screen.queryByRole('button', { name: 'Usar la cámara' })).toBeNull();
    });

    const stubCamera = (code: string) => {
      class FakeDetector {
        detect = () => Promise.resolve([{ rawValue: code }]);
      }
      Object.assign(window, { BarcodeDetector: FakeDetector });
      const stop = vi.fn();
      vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) } });
      return stop;
    };

    it('con soporte, lee el código de la cámara, marca presente y apaga la cámara al cerrarla', async () => {
      const stop = stubCamera('M-1');
      vi.stubGlobal('fetch', withRoster([entry(1)]));
      const user = userEvent.setup();
      renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
      await user.click(await screen.findByRole('button', { name: 'Usar la cámara' }));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Infante 1 Prueba: presente'));
      await user.click(screen.getByRole('button', { name: 'Cerrar la cámara' }));
      expect(stop).toHaveBeenCalled();
    });

    it('si el navegador niega la cámara lo dice y deja el lector y la captura manual', async () => {
      class FakeDetector {
        detect = () => Promise.resolve([]);
      }
      Object.assign(window, { BarcodeDetector: FakeDetector });
      vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: () => Promise.reject(new Error('denied')) } });
      vi.stubGlobal('fetch', withRoster([entry(1)]));
      const user = userEvent.setup();
      renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
      await user.click(await screen.findByRole('button', { name: 'Usar la cámara' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir la cámara');
      expect(screen.getByLabelText('Escanear o escribir matrícula')).toBeInTheDocument();
    });
  });
});
