import 'fake-indexeddb/auto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RollCallPage } from '../features/attendance/pages/roll-call-page';
import { ConnectionBanner } from '../offline/connection-banner';
import { OfflineProvider } from '../offline/offline-context';
import { createOfflineRuntime, type OfflineRuntime } from '../offline/runtime';
import { docenteSession, renderWithSession } from './test-utils';

let counter = 0;
const TODAY = new Date().toLocaleDateString('en-CA');
const journey = { id: 3, estanciaId: 1, date: TODAY, shift: 'MATUTINO', status: 'ABIERTA', openedAt: '2026-10-15T13:00:00.000Z', closedAt: null };

const entry = (n: number, status: string | null = null) => ({
  enrollmentId: n,
  childId: n,
  childName: `Infante ${n} Prueba`,
  enrollmentNumber: `M-${n}`,
  roomId: 1,
  roomName: 'Lactantes (prueba)',
  status,
  medicalLock: false,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const rowOf = async (name: string): Promise<HTMLElement> => (await screen.findByText(name, { selector: 'p' })).closest('tr') as HTMLElement;
/** La marca puede tardar un instante en aparecer: lo guardado en la tablet se lee de forma asíncrona. */
const markedAs = async (name: string, label: string) => waitFor(async () => within(await rowOf(name)).getByRole('button', { name: label, pressed: true }));

describe('pase de lista sin conexión (RF-20 a RF-23)', () => {
  let runtime: OfflineRuntime;
  /** Cómo responde el servidor a cada ruta; cambia durante la prueba para simular que vuelve la conexión. */
  let routes: Record<string, () => Response | Promise<Response>>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const userId = docenteSession.user.id;
  const registros = '/asistencia/jornadas/3/registros';

  const syncApplied = (init?: RequestInit): Response => {
    const operations = (JSON.parse(String(init?.body)) as { operations: { operationId: string }[] }).operations;
    return jsonResponse(200, { results: operations.map((o) => ({ operationId: o.operationId, status: 'APLICADA', replayed: false, saved: 1, unchanged: 0, rejections: [], code: null, message: null })) });
  };

  const mount = () =>
    renderWithSession(
      <OfflineProvider runtime={runtime} pollMs={60_000}>
        <ConnectionBanner />
        <RollCallPage />
      </OfflineProvider>,
      docenteSession,
      '/app/pase-de-lista',
    );

  beforeEach(() => {
    runtime = createOfflineRuntime({ dbName: `rollcall-offline-${counter++}` });
    routes = {
      'GET /asistencia/jornadas/activa': () => jsonResponse(200, journey),
      'GET /asistencia/jornadas/3/lista': () => jsonResponse(200, { entries: [entry(1), entry(2), entry(3)] }),
      [`POST ${registros}`]: () => Promise.reject(new TypeError('Failed to fetch')),
      'POST /sincronizacion': () => Promise.reject(new TypeError('Failed to fetch')),
    };
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
      if (key === 'POST /sincronizacion' && routes[key] === undefined) return Promise.resolve(syncApplied(init));
      const handler = routes[key];
      return handler ? Promise.resolve(handler()) : Promise.resolve(jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('si se cae la red al guardar, la asistencia queda en la tablet y se lo dice a la docente', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    expect(await screen.findByText('Sin conexión: la asistencia se guardó en esta tablet y se enviará sola.')).toBeInTheDocument();
    expect(await runtime.outbox.counts(userId)).toMatchObject({ pending: 1 });
  });

  it('lo marcado sigue a la vista como guardado aunque el servidor todavía no lo tenga', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await screen.findByText(/se guardó en esta tablet/);
    for (const name of ['Infante 1 Prueba', 'Infante 2 Prueba', 'Infante 3 Prueba']) await markedAs(name, 'Presente');
  });

  it('lo guardado en la tablet sobrevive a cerrar y volver a abrir la pantalla', async () => {
    const user = userEvent.setup();
    const first = mount();
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await screen.findByText(/se guardó en esta tablet/);
    first.unmount();
    mount();
    await markedAs('Infante 2 Prueba', 'Presente');
  });

  it('el aviso de conexión cuenta la captura pendiente y, al volver la red, "Enviar ahora" la envía', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    expect(await screen.findByText(/1 captura pendiente de enviar/)).toBeInTheDocument();
    delete routes['POST /sincronizacion'];
    await user.click(await screen.findByRole('button', { name: 'Enviar ahora' }));
    await waitFor(() => expect(screen.queryByText(/captura pendiente de enviar/)).toBeNull());
    expect(await runtime.outbox.counts(userId)).toMatchObject({ pending: 0, review: 0 });
    const sent = fetchMock.mock.calls.filter(([url]) => new URL(url as string).pathname === '/sincronizacion');
    const body = JSON.parse(String((sent.at(-1)?.[1] as RequestInit).body)) as { operations: Array<{ type: string; payload: { journeyId: number; marks: unknown[] } }> };
    expect(body.operations[0]).toMatchObject({ type: 'ATTENDANCE_MARKS', payload: { journeyId: 3 } });
    expect(body.operations[0]?.payload.marks).toHaveLength(3);
  });

  it('un error del servidor (500) también se guarda en la tablet', async () => {
    routes[`POST ${registros}`] = () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    expect(await screen.findByText(/se guardó en esta tablet/)).toBeInTheDocument();
  });

  it('un rechazo definitivo del servidor (jornada cerrada) no se guarda: se muestra y lo marcado sigue en pantalla', async () => {
    routes[`POST ${registros}`] = () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'La jornada ya está cerrada.' } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la asistencia');
    expect(await runtime.outbox.counts(userId)).toMatchObject({ pending: 0 });
    expect(screen.queryByText(/se guardó en esta tablet/)).toBeNull();
  });

  it('con conexión todo sigue igual: se guarda en el servidor y no se encola nada', async () => {
    routes[`POST ${registros}`] = () => jsonResponse(200, { saved: 3, unchanged: 0 });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => new URL(url as string).pathname === registros)).toBe(true));
    expect(await runtime.outbox.counts(userId)).toMatchObject({ pending: 0 });
    expect(screen.queryByText(/se guardó en esta tablet/)).toBeNull();
  });

  it('"Marcar a todos presentes" no pisa lo que ya quedó guardado en la tablet', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Falta injustificada' }).catch(() => within(screen.getAllByRole('row')[1] as HTMLElement).getByRole('button', { name: 'Falta injustificada' })));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await screen.findByText(/se guardó en esta tablet/);
    await user.click(screen.getByRole('button', { name: 'Marcar a todos presentes' }));
    await markedAs('Infante 1 Prueba', 'Falta injustificada');
    await markedAs('Infante 2 Prueba', 'Presente');
  });
});
