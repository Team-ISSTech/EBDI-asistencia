import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowUpsPage } from '../features/follow-ups/pages/follow-ups-page';
import { RollCallPage } from '../features/attendance/pages/roll-call-page';
import { ConnectionBanner } from '../offline/connection-banner';
import { OfflineProvider } from '../offline/offline-context';
import { createOfflineRuntime, type OfflineRuntime } from '../offline/runtime';
import { docenteSession, renderWithSession } from './test-utils';

let counter = 0;
const TODAY = new Date().toLocaleDateString('en-CA');
const journey = { id: 3, estanciaId: 1, date: TODAY, shift: 'MATUTINO', status: 'ABIERTA', openedAt: '2026-10-15T13:00:00.000Z', closedAt: null };
const entry = (n: number) => ({ enrollmentId: n, childId: n, childName: `Infante ${n} Prueba`, enrollmentNumber: `M-${n}`, roomId: 1, roomName: 'Lactantes (prueba)', status: null, medicalLock: false });

const socialWorkSession = {
  ...docenteSession,
  assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: ['SEGUIMIENTO_CONSULTAR' as const, 'SEGUIMIENTO_REGISTRAR' as const, 'INFANTE_CONSULTAR' as const],
};
const ticket = { id: 4, childId: 5, childName: 'Infante Uno Prueba', enrollmentNumber: 'M-1', roomName: 'Lactantes (prueba)', absenceDate: '2026-10-15', absenceStatus: 'FALTA_INJUSTIFICADA', status: 'ABIERTO', cause: null, expectedReturnDate: null, requiresMedicalRelease: false, medicalReleased: false, attemptCount: 0, nextAttemptAt: null, emergencyAlert: false, openedAt: '2026-10-15T15:00:00.000Z' };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('abrir las pantallas del día sin conexión (RF-20)', () => {
  let runtime: OfflineRuntime;
  let network: boolean;
  let routes: Record<string, () => Response>;

  const mount = (ui: React.ReactNode, session = docenteSession, path = '/app/pase-de-lista') =>
    renderWithSession(
      <OfflineProvider runtime={runtime} pollMs={60_000}>
        <ConnectionBanner />
        {ui}
      </OfflineProvider>,
      session,
      path,
    );

  beforeEach(() => {
    runtime = createOfflineRuntime({ dbName: `start-offline-${counter++}` });
    network = true;
    routes = {
      'GET /asistencia/jornadas/activa': () => jsonResponse(200, journey),
      'GET /asistencia/jornadas/3/lista': () => jsonResponse(200, { entries: [entry(1), entry(2)] }),
      'GET /seguimientos': () => jsonResponse(200, { followUps: [ticket] }),
      'GET /infantes/5/tutores': () => jsonResponse(200, { guardians: [] }),
      'GET /seguimientos/4/contactos': () => jsonResponse(200, { contacts: [] }),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (!network) return Promise.reject(new TypeError('Failed to fetch'));
        const handler = routes[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
        return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('la lista del día que ya se abrió con conexión se vuelve a abrir sin ella, avisando que son datos guardados', async () => {
    const online = mount(<RollCallPage />);
    expect(await screen.findByText('Infante 1 Prueba')).toBeInTheDocument();
    await waitFor(async () => expect(await runtime.cache.get(docenteSession.user.id, 'roster:3')).not.toBeNull());
    online.unmount();

    network = false;
    mount(<RollCallPage />);
    expect(await screen.findByText('Infante 1 Prueba')).toBeInTheDocument();
    expect(screen.getByText('Infante 2 Prueba')).toBeInTheDocument();
    expect(await screen.findByText('Mostrando datos guardados en esta tablet; pueden no estar al día.')).toBeInTheDocument();
  });

  it('con esa lista guardada se puede pasar lista sin conexión: queda en la tablet para enviarse sola', async () => {
    const online = mount(<RollCallPage />);
    await screen.findByText('Infante 1 Prueba');
    await waitFor(async () => expect(await runtime.cache.get(docenteSession.user.id, 'roster:3')).not.toBeNull());
    online.unmount();

    network = false;
    const user = userEvent.setup();
    mount(<RollCallPage />);
    await user.click(await screen.findByRole('button', { name: 'Marcar a todos presentes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    expect(await screen.findByText('Sin conexión: la asistencia se guardó en esta tablet y se enviará sola.')).toBeInTheDocument();
    expect(await runtime.outbox.counts(docenteSession.user.id)).toMatchObject({ pending: 1 });
  });

  it('si nunca se abrió con conexión no hay nada que mostrar y lo dice', async () => {
    network = false;
    mount(<RollCallPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la jornada.');
  });

  it('la bandeja de seguimientos también se abre sin conexión con lo último guardado', async () => {
    const online = mount(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await screen.findByText('Infante Uno Prueba');
    await waitFor(async () => expect(await runtime.cache.get(socialWorkSession.user.id, 'follow-ups')).not.toBeNull());
    online.unmount();

    network = false;
    mount(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    expect(await screen.findByText('Infante Uno Prueba')).toBeInTheDocument();
    expect(screen.getByText('Mostrando datos guardados en esta tablet; pueden no estar al día.')).toBeInTheDocument();
  });

  it('los tutores de un infante se guardan al abrirlos con conexión y se pueden ver sin ella', async () => {
    routes['GET /infantes/5/tutores'] = () =>
      jsonResponse(200, { guardians: [{ id: 1, name: 'Tutora Uno', paternalSurname: 'Prueba', maternalSurname: null, hasPhone: true, relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: false, validFrom: '2026-10-01', validUntil: null }] });
    const user = userEvent.setup();
    const online = mount(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await user.click(await screen.findByRole('button', { name: 'Llamadas de Infante Uno Prueba' }));
    await within(await screen.findByLabelText('Tutor')).findByText(/Tutora Uno Prueba/);
    await waitFor(async () => expect(await runtime.cache.get(socialWorkSession.user.id, 'guardians:5')).not.toBeNull());
    online.unmount();

    network = false;
    mount(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await user.click(await screen.findByRole('button', { name: 'Llamadas de Infante Uno Prueba' }));
    await within(await screen.findByLabelText('Tutor')).findByText(/Tutora Uno Prueba/);
  });

  it('las notas de asesoría (datos sensibles) nunca se guardan en la copia de lectura', async () => {
    const withNotes = { ...socialWorkSession, permissions: [...socialWorkSession.permissions, 'NOTA_SENSIBLE_CONSULTAR' as const] };
    routes['GET /seguimientos/4/contactos'] = () => jsonResponse(200, { contacts: [{ id: 1, attemptNumber: 1, occurredAt: '2026-10-15T16:00:00.000Z', result: 'CONTACTADO', guardianId: 1, notes: 'Nota muy sensible de asesoría.', nextAttemptAt: null }] });
    const user = userEvent.setup();
    mount(<FollowUpsPage />, withNotes, '/app/seguimientos');
    await user.click(await screen.findByRole('button', { name: 'Llamadas de Infante Uno Prueba' }));
    await screen.findByText('Nota muy sensible de asesoría.');
    expect(await runtime.cache.get(withNotes.user.id, `follow-ups:4:contacts`)).toBeNull();
    expect(await runtime.cache.get(withNotes.user.id, 'contacts:4')).toBeNull();
  });
});
