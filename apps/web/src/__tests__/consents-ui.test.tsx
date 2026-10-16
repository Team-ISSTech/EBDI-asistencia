import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuardiansCard } from '../features/children/guardians-card';
import { docenteSession, renderWithSession } from './test-utils';

const child = {
  id: 5,
  enrollmentNumber: 'M-0001',
  name: 'Infante',
  paternalSurname: 'Prueba',
  maternalSurname: null,
  birthDate: '2025-03-10',
  hasDisability: false,
  status: 'ACTIVO' as const,
  roomId: 7,
  roomName: 'Lactantes (prueba)',
};

const guardian = {
  id: 1,
  name: 'Tutora',
  paternalSurname: 'Prueba',
  maternalSurname: null,
  hasPhone: true,
  relationship: 'Madre',
  isPrimary: true,
  canPickUp: true,
  isEmergencyContact: true,
  validFrom: '2026-10-14',
  validUntil: null,
};

const consent = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  childId: 5,
  guardianId: 1,
  type: 'CONTACTO_TELEFONICO',
  noticeVersion: 'AP-2026-1',
  accepted: true,
  acceptedAt: '2026-10-14T12:00:00.000Z',
  revokedAt: null,
  ...overrides,
});

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'INFANTE_ADMINISTRAR' as const, 'CONSENTIMIENTO_REGISTRAR' as const],
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (consents: unknown[], extra: Record<string, () => Response> = {}) => {
  const handlers: Record<string, () => Response> = {
    'GET /infantes/5/tutores': () => jsonResponse(200, { guardians: [guardian] }),
    'GET /infantes/5/consentimientos': () => jsonResponse(200, { consents }),
    ...extra,
  };
  return vi.fn((url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });
};

const renderCard = (session = docenteSession) => renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, session, '/app/infantes');

/** Fila de la celda de un tipo de consentimiento. */
const consentRow = async (label: string): Promise<HTMLElement> => {
  const row = (await screen.findByText(label)).closest('li');
  if (!row) throw new Error(`Sin fila para ${label}`);
  return row;
};

describe('consentimientos en el panel de tutores', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra pendiente cuando no hay registros', async () => {
    vi.stubGlobal('fetch', routeFetch([]));
    renderCard();
    const row = await consentRow('Contacto telefónico');
    expect(within(row).getByText('Pendiente')).toBeInTheDocument();
    expect((await consentRow('Datos sensibles')).textContent).toContain('Pendiente');
  });

  it('muestra aceptado, revocado y rechazado según el registro más reciente', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        consent(),
        consent({ id: 12, type: 'TRATAMIENTO_DATOS_SENSIBLES', accepted: false }),
      ]),
    );
    renderCard();
    expect(within(await consentRow('Contacto telefónico')).getByText('Aceptado')).toBeInTheDocument();
    expect(within(await consentRow('Datos sensibles')).getByText('Rechazado')).toBeInTheDocument();
  });

  it('muestra revocado cuando la aceptación se revocó', async () => {
    vi.stubGlobal('fetch', routeFetch([consent({ revokedAt: '2026-10-15T12:00:00.000Z' })]));
    renderCard();
    expect(within(await consentRow('Contacto telefónico')).getByText('Revocado')).toBeInTheDocument();
  });

  it('quien solo consulta no ve botones de registro ni de revocación', async () => {
    vi.stubGlobal('fetch', routeFetch([consent()]));
    renderCard();
    await consentRow('Contacto telefónico');
    expect(screen.queryByRole('button', { name: /Registrar aceptación|Revocar/ })).toBeNull();
  });

  it('la directora registra la aceptación sin enviar versión de aviso (la fija el servidor)', async () => {
    const fetchMock = routeFetch([], { 'POST /infantes/5/consentimientos': () => jsonResponse(201, consent()) });
    vi.stubGlobal('fetch', fetchMock);
    renderCard(directoraSession);
    const row = await consentRow('Contacto telefónico');
    await userEvent.click(within(row).getByRole('button', { name: 'Registrar aceptación' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ guardianId: 1, type: 'CONTACTO_TELEFONICO', accepted: true });
  });

  it('la directora revoca una aceptación vigente', async () => {
    const fetchMock = routeFetch([consent()], { 'POST /consentimientos/11/revocar': () => jsonResponse(200, consent({ revokedAt: '2026-10-15T12:00:00.000Z' })) });
    vi.stubGlobal('fetch', fetchMock);
    renderCard(directoraSession);
    const row = await consentRow('Contacto telefónico');
    await userEvent.click(within(row).getByRole('button', { name: 'Revocar' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/consentimientos/11/revocar'))).toBe(true));
  });

  it('avisa si el registro falla', async () => {
    vi.stubGlobal('fetch', routeFetch([], { 'POST /infantes/5/consentimientos': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'Ya hay una aceptación vigente de este consentimiento.' } }) }));
    renderCard(directoraSession);
    const row = await consentRow('Contacto telefónico');
    await userEvent.click(within(row).getByRole('button', { name: 'Registrar aceptación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay una aceptación vigente de este consentimiento.');
  });

  it('avisa si no se pudo cargar el estado de consentimiento', async () => {
    vi.stubGlobal('fetch', routeFetch([], { 'GET /infantes/5/consentimientos': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderCard();
    expect(await screen.findByText('No se pudo cargar el estado de consentimiento.')).toBeInTheDocument();
  });
});
