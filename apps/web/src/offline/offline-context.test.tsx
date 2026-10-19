import 'fake-indexeddb/auto';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { docenteSession, renderWithSession } from '../__tests__/test-utils';
import { useOffline } from './offline-api';
import { OfflineProvider } from './offline-context';
import { createOfflineRuntime, type OfflineRuntime } from './runtime';

let counter = 0;
const marks = (n = 1) => ({ journeyId: 3, marks: [{ enrollmentId: n, status: 'PRESENTE' as const, clientId: crypto.randomUUID(), method: 'MANUAL' as const }] });

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const appliedResponse = (init?: RequestInit): Response => {
  const operations = (JSON.parse(String(init?.body)) as { operations: { operationId: string }[] }).operations;
  return jsonResponse(200, { results: operations.map((o) => ({ operationId: o.operationId, status: 'APLICADA', replayed: false, saved: 1, unchanged: 0, rejections: [], code: null, message: null })) });
};

function Probe() {
  const offline = useOffline();
  return (
    <div>
      <p data-testid="state">{`online=${offline.online} pending=${offline.counts.pending} review=${offline.counts.review} others=${offline.counts.others} syncing=${offline.syncing}`}</p>
      <button type="button" onClick={() => void offline.enqueue({ type: 'ATTENDANCE_MARKS', payload: marks() })}>
        Encolar
      </button>
      <button type="button" onClick={() => void offline.syncNow()}>
        Enviar ahora
      </button>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;
const setOnline = (value: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });

describe('OfflineProvider (RF-20 a RF-23)', () => {
  let runtime: OfflineRuntime;
  const sessionUserId = docenteSession.user.id;

  const mount = (session: typeof docenteSession | null = docenteSession, pollMs = 60_000) =>
    renderWithSession(
      <OfflineProvider runtime={runtime} pollMs={pollMs}>
        <Probe />
      </OfflineProvider>,
      session,
      '/app/pase-de-lista',
    );

  beforeEach(() => {
    setOnline(true);
    runtime = createOfflineRuntime({ dbName: `ctx-test-${counter++}` });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setOnline(true);
  });

  it('muestra lo que hay en la cola al arrancar: lo propio y lo de otras personas', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await runtime.outbox.enqueue({ userId: sessionUserId, estanciaId: 1, type: 'ATTENDANCE_MARKS', payload: marks() });
    await runtime.outbox.enqueue({ userId: 999, estanciaId: 1, type: 'ATTENDANCE_MARKS', payload: marks(2) });
    mount();
    await waitFor(() => expect(state()).toContain('others=1'));
    expect(state()).toContain('pending=1');
  });

  it('al encolar con conexión envía de inmediato y deja la cola vacía, y actualiza lo que se ve', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(appliedResponse(init)));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { client } = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await user.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(state()).toContain('pending=0'));
    expect(new URL(fetchMock.mock.calls[0]?.[0] as string).pathname).toBe('/sincronizacion');
    expect(invalidate).toHaveBeenCalled();
  });

  it('sin conexión guarda en la tablet y no intenta enviar; al volver la conexión lo envía solo', async () => {
    setOnline(false);
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(appliedResponse(init)));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    mount();
    expect(state()).toContain('online=false');
    await user.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(state()).toContain('pending=1'));
    expect(fetchMock).not.toHaveBeenCalled();
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(state()).toContain('pending=0'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('si el envío falla conserva la captura, y "Enviar ahora" ignora la espera', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => Promise.resolve(appliedResponse(init)));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(state()).toContain('pending=1'));
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }));
    await waitFor(() => expect(state()).toContain('pending=0'));
  });

  it('un rechazo del servidor queda para revisar y no se pierde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const [operation] = (JSON.parse(String(init?.body)) as { operations: { operationId: string }[] }).operations;
        return Promise.resolve(jsonResponse(200, { results: [{ operationId: operation?.operationId, status: 'RECHAZADA', replayed: false, saved: 0, unchanged: 0, rejections: [], code: 'JORNADA_CERRADA', message: 'La jornada ya estaba cerrada.' }] }));
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(state()).toContain('review=1'));
    expect(state()).toContain('pending=0');
  });

  it('un 401 cierra la sesión en pantalla pero conserva las capturas para cuando vuelva a entrar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(401, { error: { code: 'NO_AUTENTICADO', message: 'Inicia sesión.' } }))));
    const user = userEvent.setup();
    const { client } = mount();
    await user.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(client.getQueryData(['session'])).toBeNull());
    expect((await runtime.outbox.counts(sessionUserId)).pending).toBe(1);
  });

  it('no envía lo de otra persona ni revienta si no hay sesión', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);
    await runtime.outbox.enqueue({ userId: 999, estanciaId: 1, type: 'ATTENDANCE_MARKS', payload: marks() });
    mount(null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reintenta solo cada cierto tiempo mientras haya pendientes, respetando la espera entre intentos', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => Promise.resolve(appliedResponse(init)));
    vi.stubGlobal('fetch', fetchMock);
    await runtime.outbox.enqueue({ userId: sessionUserId, estanciaId: 1, type: 'ATTENDANCE_MARKS', payload: marks() });
    mount(docenteSession, 40);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Antes de que pasen los 5 s de espera, el temporizador no vuelve a intentar.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const real = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(real + 6000);
    try {
      await waitFor(() => expect(state()).toContain('pending=0'), { timeout: 3000 });
    } finally {
      spy.mockRestore();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
