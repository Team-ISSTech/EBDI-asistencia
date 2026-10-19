import 'fake-indexeddb/auto';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowUpsPage } from '../features/follow-ups/pages/follow-ups-page';
import { ConnectionBanner } from '../offline/connection-banner';
import { OfflineProvider } from '../offline/offline-context';
import { createOfflineRuntime, type OfflineRuntime } from '../offline/runtime';
import { docenteSession, renderWithSession } from './test-utils';

let counter = 0;

const socialWorkSession = {
  ...docenteSession,
  assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: ['SEGUIMIENTO_CONSULTAR' as const, 'SEGUIMIENTO_REGISTRAR' as const, 'NOTA_SENSIBLE_CONSULTAR' as const, 'INFANTE_CONSULTAR' as const],
};

const ticket = {
  id: 4,
  childId: 5,
  childName: 'Infante Uno Prueba',
  enrollmentNumber: 'M-1',
  roomName: 'Lactantes (prueba)',
  absenceDate: '2026-10-15',
  absenceStatus: 'FALTA_INJUSTIFICADA',
  status: 'ABIERTO',
  cause: null,
  expectedReturnDate: null,
  requiresMedicalRelease: false,
  medicalReleased: false,
  attemptCount: 0,
  nextAttemptAt: null,
  emergencyAlert: false,
  openedAt: '2026-10-15T15:00:00.000Z',
};

const guardian = { id: 1, name: 'Tutora Uno', paternalSurname: 'Prueba', maternalSurname: null, hasPhone: true, relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: false, validFrom: '2026-10-01', validUntil: null };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('llamadas de seguimiento sin conexión (RF-20 a RF-23)', () => {
  let runtime: OfflineRuntime;
  let routes: Record<string, () => Response | Promise<Response>>;
  const userId = socialWorkSession.user.id;

  const mount = () =>
    renderWithSession(
      <OfflineProvider runtime={runtime} pollMs={60_000}>
        <ConnectionBanner />
        <FollowUpsPage />
      </OfflineProvider>,
      socialWorkSession,
      '/app/seguimientos',
    );

  const registerNoAnswer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Llamadas de Infante Uno Prueba' }));
    await user.click(await screen.findByLabelText('No contestó'));
    await user.type(screen.getByLabelText('Notas de asesoría'), 'No hubo respuesta, se deja recado.');
    await user.click(screen.getByRole('button', { name: 'Registrar llamada' }));
  };

  beforeEach(() => {
    runtime = createOfflineRuntime({ dbName: `followup-offline-${counter++}` });
    routes = {
      'GET /seguimientos': () => jsonResponse(200, { followUps: [ticket] }),
      'GET /seguimientos/4/contactos': () => jsonResponse(200, { contacts: [] }),
      'GET /infantes/5/tutores': () => jsonResponse(200, { guardians: [guardian] }),
      'POST /seguimientos/4/contactos': () => Promise.reject(new TypeError('Failed to fetch')),
      'POST /sincronizacion': () => Promise.reject(new TypeError('Failed to fetch')),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const handler = routes[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
        return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('si se cae la red al registrar la llamada, queda en la tablet y se lo dice a quien la hizo', async () => {
    const user = userEvent.setup();
    mount();
    await registerNoAnswer(user);
    expect(await screen.findByText('Sin conexión: la llamada se guardó en esta tablet y se enviará sola.')).toBeInTheDocument();
    expect(await runtime.outbox.counts(userId)).toMatchObject({ pending: 1 });
  });

  it('lo guardado lleva las notas y la hora en que se hizo la llamada, y solo existe cifrado en la tablet', async () => {
    const before = Date.now();
    const user = userEvent.setup();
    mount();
    await registerNoAnswer(user);
    await screen.findByText(/se guardó en esta tablet/);
    const [operation] = await runtime.outbox.due(userId, Date.now(), true);
    expect(operation).toMatchObject({ type: 'FOLLOW_UP_CONTACT', payload: { followUpId: 4, contact: { result: 'SIN_RESPUESTA', notes: 'No hubo respuesta, se deja recado.' } } });
    expect(Date.parse(operation?.capturedAt ?? '')).toBeGreaterThanOrEqual(before - 1000);
    const stored = JSON.stringify(await runtime.outbox.review(userId));
    expect(stored).not.toContain('recado');
  });

  it('al volver la conexión la envía sola como una operación de sincronización', async () => {
    const user = userEvent.setup();
    mount();
    await registerNoAnswer(user);
    await screen.findByText(/1 captura pendiente de enviar/);
    routes['POST /sincronizacion'] = () => {
      const operations = JSON.parse(String((vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit).body)) as { operations: { operationId: string; type: string }[] };
      expect(operations.operations[0]?.type).toBe('FOLLOW_UP_CONTACT');
      return jsonResponse(200, { results: operations.operations.map((o) => ({ operationId: o.operationId, status: 'APLICADA', replayed: false, saved: 1, unchanged: 0, rejections: [], code: null, message: null })) });
    };
    await user.click(await screen.findByRole('button', { name: 'Enviar ahora' }));
    await waitFor(async () => expect(await runtime.outbox.counts(userId)).toMatchObject({ pending: 0, review: 0 }));
  });

  it('un rechazo definitivo (el seguimiento ya está cerrado) no se guarda en la tablet: se muestra', async () => {
    routes['POST /seguimientos/4/contactos'] = () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'El seguimiento ya está cerrado.' } });
    const user = userEvent.setup();
    mount();
    await registerNoAnswer(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('El seguimiento ya está cerrado.');
    expect(await runtime.outbox.counts(userId)).toMatchObject({ pending: 0 });
  });
});
