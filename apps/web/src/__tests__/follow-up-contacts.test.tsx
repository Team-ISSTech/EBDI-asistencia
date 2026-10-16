import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowUpsPage } from '../features/follow-ups/pages/follow-ups-page';
import { docenteSession, renderWithSession } from './test-utils';

const socialWorkSession = {
  ...docenteSession,
  assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: ['SEGUIMIENTO_CONSULTAR' as const, 'SEGUIMIENTO_REGISTRAR' as const, 'NOTA_SENSIBLE_CONSULTAR' as const, 'INFANTE_CONSULTAR' as const],
};
const viewerSession = { ...socialWorkSession, permissions: ['SEGUIMIENTO_CONSULTAR' as const] };

const ticket = (overrides: Record<string, unknown> = {}) => ({
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
  attemptCount: 0,
  nextAttemptAt: null,
  emergencyAlert: false,
  openedAt: '2026-10-15T15:00:00.000Z',
  ...overrides,
});

const guardian = (id: number, name: string, emergency: boolean) => ({
  id,
  name,
  paternalSurname: 'Prueba',
  maternalSurname: null,
  hasPhone: true,
  relationship: 'Madre',
  isPrimary: id === 1,
  canPickUp: true,
  isEmergencyContact: emergency,
  validFrom: '2026-10-01',
  validUntil: null,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const base = (followUps: unknown[], extra: Record<string, () => Response> = {}) =>
  routeFetch({
    'GET /seguimientos': () => jsonResponse(200, { followUps }),
    'GET /seguimientos/4/contactos': () => jsonResponse(200, { contacts: [] }),
    'GET /infantes/5/tutores': () => jsonResponse(200, { guardians: [guardian(1, 'Tutora Uno', false), guardian(2, 'Tutor Dos', true)] }),
    ...extra,
  });

const postedBody = (fetchMock: ReturnType<typeof routeFetch>): Record<string, unknown> | null => {
  const call = fetchMock.mock.calls.find(([url, init]) => new URL(url).pathname === '/seguimientos/4/contactos' && (init as RequestInit | undefined)?.method === 'POST');
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : null;
};

const openPanel = async () => userEvent.click(await screen.findByRole('button', { name: 'Llamadas de Infante Uno Prueba' }));

describe('contactos del seguimiento', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('quien solo consulta no ve el botón de llamadas', async () => {
    vi.stubGlobal('fetch', base([ticket()]));
    renderWithSession(<FollowUpsPage />, viewerSession, '/app/seguimientos');
    await screen.findByText('Infante Uno Prueba');
    expect(screen.queryByRole('button', { name: /Llamadas de/ })).toBeNull();
  });

  it('muestra el segundo intento programado y la alerta a contactos de emergencia en la bandeja', async () => {
    vi.stubGlobal('fetch', base([ticket({ cause: 'NO_LOC', status: 'CLASIFICADO', attemptCount: 1, nextAttemptAt: '2026-10-15T20:00:00.000Z' }), ticket({ id: 9, childName: 'Infante Dos Prueba', cause: 'NO_LOC', status: 'CLASIFICADO', attemptCount: 2, emergencyAlert: true })]));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    expect(await screen.findByText(/Segundo intento/)).toBeInTheDocument();
    expect(screen.getByText('Avisar a contactos de emergencia')).toBeInTheDocument();
  });

  it('abre el panel con el historial de intentos y las notas', async () => {
    vi.stubGlobal(
      'fetch',
      base([ticket({ attemptCount: 1 })], {
        'GET /seguimientos/4/contactos': () =>
          jsonResponse(200, { contacts: [{ id: 1, attemptNumber: 1, occurredAt: '2026-10-15T16:00:00.000Z', result: 'CONTACTADO', guardianId: 1, notes: 'Fiebre desde ayer.', nextAttemptAt: null }] }),
      }),
    );
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    expect(await screen.findByText('Fiebre desde ayer.')).toBeInTheDocument();
    expect(screen.getByText('Intento 1')).toBeInTheDocument();
  });

  it('registra una llamada con el tutor: causa, fecha de retorno y notas', async () => {
    const fetchMock = base([ticket()], { 'POST /seguimientos/4/contactos': () => jsonResponse(201, ticket({ status: 'CLASIFICADO', cause: 'ENF_CASA', requiresMedicalRelease: true, attemptCount: 1 })) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    await userEvent.selectOptions(await screen.findByLabelText('Tutor'), '1');
    await userEvent.click(screen.getByLabelText('Hablé con el tutor'));
    await userEvent.selectOptions(screen.getByLabelText('Causa'), 'ENF_CASA');
    await userEvent.type(screen.getByLabelText('Fecha estimada de retorno'), '2026-10-30');
    await userEvent.type(screen.getByLabelText('Notas de asesoría'), 'Fiebre desde ayer.');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    await waitFor(() => expect(postedBody(fetchMock)).not.toBeNull());
    expect(postedBody(fetchMock)).toEqual({ result: 'CONTACTADO', guardianId: 1, cause: 'ENF_CASA', expectedReturnDate: '2026-10-30', notes: 'Fiebre desde ayer.' });
  });

  it('registrar que no contestó no pide causa ni fecha', async () => {
    const fetchMock = base([ticket()], { 'POST /seguimientos/4/contactos': () => jsonResponse(201, ticket({ status: 'CLASIFICADO', cause: 'NO_LOC', attemptCount: 1 })) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    await userEvent.click(await screen.findByLabelText('No contestó'));
    expect(screen.queryByLabelText('Causa')).toBeNull();
    expect(screen.queryByLabelText('Fecha estimada de retorno')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    await waitFor(() => expect(postedBody(fetchMock)).not.toBeNull());
    expect(postedBody(fetchMock)).toEqual({ result: 'SIN_RESPUESTA' });
  });

  it('avisa si el tutor, la causa o la fecha faltan antes de enviar', async () => {
    const fetchMock = base([ticket()]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    await userEvent.click(await screen.findByLabelText('Hablé con el tutor'));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige el tutor, la causa y la fecha estimada de retorno.');
    expect(postedBody(fetchMock)).toBeNull();
  });

  it('muestra el error del servidor al registrar', async () => {
    vi.stubGlobal('fetch', base([ticket()], { 'POST /seguimientos/4/contactos': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'Otra persona registró un intento al mismo tiempo; actualiza la pantalla.' } }) }));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    await userEvent.click(await screen.findByLabelText('No contestó'));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    expect(await screen.findByText('Otra persona registró un intento al mismo tiempo; actualiza la pantalla.')).toBeInTheDocument();
  });

  it('con la alerta activa lista a los contactos de emergencia del infante', async () => {
    vi.stubGlobal('fetch', base([ticket({ cause: 'NO_LOC', status: 'CLASIFICADO', attemptCount: 2, emergencyAlert: true })]));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    const alert = await screen.findByText('Contactos de emergencia');
    const box = alert.closest('section') as HTMLElement;
    expect(within(box).getByText('Tutor Dos Prueba')).toBeInTheDocument();
    expect(within(box).queryByText('Tutora Uno Prueba')).toBeNull();
  });

  it('cerrar el panel lo oculta', async () => {
    vi.stubGlobal('fetch', base([ticket()]));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('button', { name: 'Registrar llamada' })).toBeNull();
  });
});
