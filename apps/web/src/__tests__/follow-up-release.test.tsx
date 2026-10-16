import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowUpsPage } from '../features/follow-ups/pages/follow-ups-page';
import { docenteSession, renderWithSession } from './test-utils';

const base = { ...docenteSession, assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }] };
const socialWorkSession = { ...base, permissions: ['SEGUIMIENTO_CONSULTAR' as const, 'SEGUIMIENTO_REGISTRAR' as const, 'NOTA_SENSIBLE_CONSULTAR' as const, 'INFANTE_CONSULTAR' as const] };
const doctorSession = { ...socialWorkSession, assignments: [{ role: 'MEDICO' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }], permissions: [...socialWorkSession.permissions, 'ALTA_MEDICA_REGISTRAR' as const] };

const ticket = (overrides: Record<string, unknown> = {}) => ({
  id: 4,
  childId: 5,
  childName: 'Infante Uno Prueba',
  enrollmentNumber: 'M-1',
  roomName: 'Lactantes (prueba)',
  absenceDate: '2026-10-15',
  absenceStatus: 'FALTA_INJUSTIFICADA',
  status: 'CLASIFICADO',
  cause: 'ENF_CASA',
  expectedReturnDate: '2026-10-30',
  requiresMedicalRelease: true,
  medicalReleased: false,
  attemptCount: 1,
  nextAttemptAt: null,
  emergencyAlert: false,
  openedAt: '2026-10-15T15:00:00.000Z',
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (followUps: unknown[], extra: Record<string, () => Response> = {}) => {
  const handlers: Record<string, () => Response> = {
    'GET /seguimientos': () => jsonResponse(200, { followUps }),
    'GET /seguimientos/4/contactos': () => jsonResponse(200, { contacts: [] }),
    'GET /infantes/5/tutores': () => jsonResponse(200, { guardians: [] }),
    ...extra,
  };
  return vi.fn((url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });
};

const bodyOf = (fetchMock: ReturnType<typeof routeFetch>, path: string): Record<string, unknown> | null => {
  const call = fetchMock.mock.calls.find(([url, init]) => new URL(url).pathname === path && (init as RequestInit | undefined)?.method === 'POST');
  if (!call) return null;
  const raw = (call[1] as RequestInit).body;
  return raw ? JSON.parse(String(raw)) : {};
};

const openPanel = async () => userEvent.click(await screen.findByRole('button', { name: 'Llamadas de Infante Uno Prueba' }));

describe('alta médica y cierre del seguimiento', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('la bandeja distingue el candado activo del alta registrada', async () => {
    vi.stubGlobal('fetch', routeFetch([ticket(), ticket({ id: 8, childName: 'Infante Dos Prueba', medicalReleased: true })]));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    const locked = (await screen.findByText('Infante Uno Prueba')).closest('tr') as HTMLElement;
    const released = (await screen.findByText('Infante Dos Prueba')).closest('tr') as HTMLElement;
    expect(within(locked).getByText('Requiere alta médica')).toBeInTheDocument();
    expect(within(released).getByText('Alta médica registrada')).toBeInTheDocument();
    expect(within(released).queryByText('Requiere alta médica')).toBeNull();
  });

  it('el médico registra el alta con fecha, folio y observaciones', async () => {
    const fetchMock = routeFetch([ticket()], { 'POST /seguimientos/4/alta': () => jsonResponse(201, ticket({ medicalReleased: true })) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<FollowUpsPage />, doctorSession, '/app/seguimientos');
    await openPanel();
    await userEvent.type(await screen.findByLabelText('Fecha del alta'), '2026-10-28');
    await userEvent.type(screen.getByLabelText('Folio'), 'ALTA-0042');
    await userEvent.type(screen.getByLabelText('Observaciones del médico'), 'Sin fiebre desde hace 48 h.');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar alta médica' }));
    await waitFor(() => expect(bodyOf(fetchMock, '/seguimientos/4/alta')).not.toBeNull());
    expect(bodyOf(fetchMock, '/seguimientos/4/alta')).toEqual({ dischargeDate: '2026-10-28', folio: 'ALTA-0042', observations: 'Sin fiebre desde hace 48 h.' });
  });

  it('el alta solo exige la fecha', async () => {
    const fetchMock = routeFetch([ticket()], { 'POST /seguimientos/4/alta': () => jsonResponse(201, ticket({ medicalReleased: true })) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<FollowUpsPage />, doctorSession, '/app/seguimientos');
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar alta médica' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Indica la fecha del alta.');
    expect(bodyOf(fetchMock, '/seguimientos/4/alta')).toBeNull();
    await userEvent.type(screen.getByLabelText('Fecha del alta'), '2026-10-28');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar alta médica' }));
    await waitFor(() => expect(bodyOf(fetchMock, '/seguimientos/4/alta')).toEqual({ dischargeDate: '2026-10-28' }));
  });

  it('quien no es médico ve que falta el alta y no el formulario', async () => {
    vi.stubGlobal('fetch', routeFetch([ticket()]));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    expect(await screen.findByText('Esperando el alta del médico de estancia.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar alta médica' })).toBeNull();
  });

  it('un caso sin candado, o con el alta ya registrada, no pide alta', async () => {
    vi.stubGlobal('fetch', routeFetch([ticket({ requiresMedicalRelease: false, cause: 'PER_TUT' })]));
    renderWithSession(<FollowUpsPage />, doctorSession, '/app/seguimientos');
    await openPanel();
    await screen.findByRole('button', { name: 'Cerrar seguimiento' });
    expect(screen.queryByRole('button', { name: 'Registrar alta médica' })).toBeNull();
    expect(screen.queryByText('Esperando el alta del médico de estancia.')).toBeNull();
  });

  it('trabajo social cierra el seguimiento', async () => {
    const fetchMock = routeFetch([ticket({ requiresMedicalRelease: false, cause: 'PER_TUT' })], { 'POST /seguimientos/4/cierre': () => jsonResponse(201, ticket({ status: 'CERRADO' })) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar seguimiento' }));
    await waitFor(() => expect(bodyOf(fetchMock, '/seguimientos/4/cierre')).not.toBeNull());
  });

  it('muestra por qué no se puede cerrar el seguimiento', async () => {
    vi.stubGlobal('fetch', routeFetch([ticket()], { 'POST /seguimientos/4/cierre': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'El caso requiere el alta médica del médico de estancia antes de cerrarse.' } }) }));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar seguimiento' }));
    expect(await screen.findByText('El caso requiere el alta médica del médico de estancia antes de cerrarse.')).toBeInTheDocument();
  });
});
