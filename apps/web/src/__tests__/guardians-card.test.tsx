import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildrenPage } from '../features/children/pages/children-page';
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

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'INFANTE_ADMINISTRAR' as const, 'NOTA_SENSIBLE_CONSULTAR' as const],
};
const socialWorkSession = {
  ...docenteSession,
  assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'NOTA_SENSIBLE_CONSULTAR' as const],
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const handler = handlers[key];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

const listHandler = (guardians: unknown[]) => ({ 'GET /infantes/5/tutores': () => jsonResponse(200, { guardians }) });
const bodiesOf = (fetchMock: ReturnType<typeof routeFetch>, method: string, path: string): unknown[] =>
  fetchMock.mock.calls
    .filter(([url, init]) => new URL(url).pathname === path && (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe('GuardiansCard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista los tutores con parentesco y permisos, sin teléfono', async () => {
    vi.stubGlobal('fetch', routeFetch(listHandler([guardian])));
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, docenteSession, '/app/infantes');
    expect(await screen.findByText('Tutora Prueba')).toBeInTheDocument();
    expect(screen.getByText('Madre')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();
    expect(screen.getByText('Puede recoger')).toBeInTheDocument();
    expect(screen.getByText('Contacto de emergencia')).toBeInTheDocument();
  });

  it('muestra el estado vacío y avisa si no carga', async () => {
    vi.stubGlobal('fetch', routeFetch(listHandler([])));
    const { unmount } = renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, docenteSession, '/app/infantes');
    expect(await screen.findByText('Sin tutores vinculados')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('fetch', routeFetch({ 'GET /infantes/5/tutores': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, docenteSession, '/app/infantes');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los tutores.');
  });

  it('una docente no ve el alta ni el teléfono', async () => {
    vi.stubGlobal('fetch', routeFetch(listHandler([guardian])));
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, docenteSession, '/app/infantes');
    await screen.findByText('Tutora Prueba');
    expect(screen.queryByRole('button', { name: 'Agregar tutor' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver teléfono' })).toBeNull();
  });

  it('trabajo social revela el teléfono bajo demanda y puede ocultarlo', async () => {
    const fetchMock = routeFetch({ ...listHandler([guardian]), 'GET /tutores/1/telefono': () => jsonResponse(200, { phone: '5512345678' }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, socialWorkSession, '/app/infantes');
    await screen.findByText('Tutora Prueba');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/telefono'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Ver teléfono' }));
    expect(await screen.findByText('55 1234 5678')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar teléfono' }));
    expect(screen.queryByText('55 1234 5678')).toBeNull();
  });

  it('avisa si no se pudo consultar el teléfono', async () => {
    vi.stubGlobal('fetch', routeFetch({ ...listHandler([guardian]), 'GET /tutores/1/telefono': () => jsonResponse(403, { error: { code: 'SIN_PERMISO', message: 'x' } }) }));
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, socialWorkSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Ver teléfono' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar el teléfono.');
  });

  it('la directora registra al tutor y lo vincula en dos pasos', async () => {
    const fetchMock = routeFetch({
      ...listHandler([]),
      'POST /tutores': () => jsonResponse(201, { id: 9, name: 'Tutora', paternalSurname: 'Prueba', maternalSurname: null, hasPhone: true }),
      'POST /infantes/5/tutores': () => jsonResponse(201, { ...guardian, id: 9 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar tutor' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Tutora');
    await userEvent.type(screen.getByLabelText('Apellido paterno'), 'Prueba');
    await userEvent.type(screen.getByLabelText('Teléfono'), '55 1234 5678');
    await userEvent.type(screen.getByLabelText('Parentesco'), 'Madre');
    await userEvent.click(screen.getByLabelText('Tutor principal'));
    await userEvent.click(screen.getByLabelText('Contacto de emergencia'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar tutor' }));
    await waitFor(() => expect(bodiesOf(fetchMock, 'POST', '/infantes/5/tutores')).toHaveLength(1));
    expect(bodiesOf(fetchMock, 'POST', '/tutores')[0]).toMatchObject({ name: 'Tutora', paternalSurname: 'Prueba', phone: '55 1234 5678' });
    expect(bodiesOf(fetchMock, 'POST', '/infantes/5/tutores')[0]).toMatchObject({
      guardianId: 9,
      relationship: 'Madre',
      isPrimary: true,
      isEmergencyContact: true,
      canPickUp: false,
    });
    await waitFor(() => expect(screen.queryByLabelText('Parentesco')).toBeNull());
  });

  it('muestra el conflicto del tutor principal sin cerrar el formulario', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        ...listHandler([]),
        'POST /tutores': () => jsonResponse(201, { id: 9, name: 'T', paternalSurname: 'P', maternalSurname: null, hasPhone: true }),
        'POST /infantes/5/tutores': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'El infante ya tiene un tutor principal.' } }),
      }),
    );
    renderWithSession(<GuardiansCard child={child} onClose={vi.fn()} />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar tutor' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'T');
    await userEvent.type(screen.getByLabelText('Apellido paterno'), 'P');
    await userEvent.type(screen.getByLabelText('Teléfono'), '5512345678');
    await userEvent.type(screen.getByLabelText('Parentesco'), 'Madre');
    await userEvent.click(screen.getByLabelText('Tutor principal'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar tutor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El infante ya tiene un tutor principal.');
    expect(screen.getByLabelText('Parentesco')).toBeInTheDocument();
  });

  it('se abre desde la fila del infante y se cierra', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /infantes': () => jsonResponse(200, { children: [child] }), ...listHandler([guardian]) }));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Tutores de Infante Prueba' }));
    expect(await screen.findByText('Tutora Prueba')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Tutora Prueba')).toBeNull();
  });
});
