import { screen, waitFor } from '@testing-library/react';
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
  isEmergencyContact: false,
  validFrom: '2026-10-14',
  validUntil: null,
};

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'INFANTE_ADMINISTRAR' as const],
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const handler = handlers[key];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const listing = {
  'GET /infantes/5/tutores': () => jsonResponse(200, { guardians: [guardian] }),
  'GET /infantes/5/consentimientos': () => jsonResponse(200, { consents: [] }),
};

const bodiesOf = (fetchMock: ReturnType<typeof routeFetch>, method: string, path: string): unknown[] =>
  fetchMock.mock.calls
    .filter(([url, init]) => new URL(url).pathname === path && (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe('editar y desvincular tutores (RF-34)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin permiso de administrar no aparecen las acciones', async () => {
    vi.stubGlobal('fetch', routeFetch(listing));
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, docenteSession, '/app/infantes');
    await screen.findByText('Tutora Prueba');
    expect(screen.queryByRole('button', { name: /Editar a Tutora/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desvincular a Tutora/ })).not.toBeInTheDocument();
  });

  it('edita al tutor y su vínculo en dos peticiones, y no manda el teléfono si se deja vacío', async () => {
    const fetchMock = routeFetch({
      ...listing,
      'PATCH /tutores/1': () => jsonResponse(200, { id: 1, name: 'Marta', paternalSurname: 'Prueba', maternalSurname: null, hasPhone: true }),
      'PATCH /infantes/5/tutores/1': () => jsonResponse(200, guardian),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Editar a Tutora Prueba' }));
    const name = screen.getByLabelText('Nombre');
    expect(name).toHaveValue('Tutora');
    await user.clear(name);
    await user.type(name, 'Marta');
    await user.click(screen.getByLabelText('Contacto de emergencia'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'PATCH', '/infantes/5/tutores/1')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'PATCH', '/tutores/1')[0]).toEqual({ name: 'Marta', paternalSurname: 'Prueba', maternalSurname: null });
    expect(bodiesOf(fetchMock, 'PATCH', '/infantes/5/tutores/1')[0]).toEqual({ relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true });
  });

  it('un teléfono nuevo viaja en el cuerpo del tutor', async () => {
    const fetchMock = routeFetch({ ...listing, 'PATCH /tutores/1': () => jsonResponse(200, guardian), 'PATCH /infantes/5/tutores/1': () => jsonResponse(200, guardian) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Editar a Tutora Prueba' }));
    await user.type(screen.getByLabelText('Teléfono nuevo (vacío para no cambiarlo)'), '5598765432');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'PATCH', '/tutores/1')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'PATCH', '/tutores/1')[0]).toMatchObject({ phone: '5598765432' });
  });

  it('muestra el error del servidor, por ejemplo un segundo tutor principal', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        ...listing,
        'PATCH /tutores/1': () => jsonResponse(200, guardian),
        'PATCH /infantes/5/tutores/1': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'El infante ya tiene un tutor principal.' } }),
      }),
    );
    const user = userEvent.setup();
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Editar a Tutora Prueba' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El infante ya tiene un tutor principal.');
  });

  it('desvincular pide confirmación y conserva el historial', async () => {
    const fetchMock = routeFetch({ ...listing, 'DELETE /infantes/5/tutores/1': () => new Response(null, { status: 204 }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, directoraSession, '/app/infantes');
    await user.click(await screen.findByRole('button', { name: 'Desvincular a Tutora Prueba' }));
    expect(screen.getByText(/queda como historial/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirmar desvinculación' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true));
  });
});
