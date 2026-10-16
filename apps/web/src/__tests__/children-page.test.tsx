import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildrenPage } from '../features/children/pages/children-page';
import { docenteSession, renderWithSession } from './test-utils';

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'INFANTE_ADMINISTRAR' as const, 'CONSENTIMIENTO_REGISTRAR' as const],
};

const rooms = {
  rooms: [
    { id: 7, estanciaId: 1, name: 'Lactantes (prueba)', shift: 'MATUTINO', minAgeMonths: 0, maxAgeMonths: 18, capacity: 12, status: 'ACTIVO' },
  ],
};

const child = {
  id: 1,
  enrollmentNumber: 'M-0001',
  name: 'Infante',
  paternalSurname: 'Prueba',
  maternalSurname: null,
  birthDate: '2025-03-10',
  hasDisability: false,
  status: 'ACTIVO',
  roomId: 7,
  roomName: 'Lactantes (prueba)',
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Responde según la ruta, sin depender del orden de las llamadas. */
const routeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const handler = handlers[key];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });

describe('ChildrenPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista los infantes con su sala y matrícula', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /infantes': () => jsonResponse(200, { children: [child] }) }));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    expect(await screen.findByText('Infante Prueba')).toBeInTheDocument();
    expect(screen.getByText('M-0001')).toBeInTheDocument();
    expect(screen.getByText('Lactantes (prueba)')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay infantes', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /infantes': () => jsonResponse(200, { children: [] }) }));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    expect(await screen.findByText('Sin infantes registrados')).toBeInTheDocument();
  });

  it('una docente no ve el botón de alta', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /infantes': () => jsonResponse(200, { children: [child] }) }));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    await screen.findByText('Infante Prueba');
    expect(screen.queryByRole('button', { name: 'Nuevo infante' })).toBeNull();
  });

  it('muestra un aviso si la lista no carga', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /infantes': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el padrón de infantes.');
  });

  it('la directora da de alta a un infante en una sala', async () => {
    const fetchMock = routeFetch({
      'GET /infantes': () => jsonResponse(200, { children: [] }),
      'GET /salas': () => jsonResponse(200, rooms),
      'POST /infantes': () => jsonResponse(201, child),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await screen.findByText('Sin infantes registrados');
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo infante' }));
    await userEvent.type(screen.getByLabelText('Matrícula'), 'M-0001');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Infante');
    await userEvent.type(screen.getByLabelText('Apellido paterno'), 'Prueba');
    await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2025-03-10');
    await userEvent.selectOptions(await screen.findByLabelText('Sala'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar infante' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
      enrollmentNumber: 'M-0001',
      name: 'Infante',
      paternalSurname: 'Prueba',
      birthDate: '2025-03-10',
      roomId: 7,
      hasDisability: false,
    });
    await waitFor(() => expect(screen.queryByLabelText('Matrícula')).toBeNull());
  });

  it('pide el grupo de discapacidad solo cuando hay discapacidad', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({ 'GET /infantes': () => jsonResponse(200, { children: [] }), 'GET /salas': () => jsonResponse(200, rooms) }),
    );
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo infante' }));
    expect(screen.queryByLabelText('Grupo de discapacidad')).toBeNull();
    await userEvent.click(screen.getByLabelText('Tiene discapacidad'));
    expect(screen.getByLabelText('Grupo de discapacidad')).toBeInTheDocument();
  });

  it('avisa junto a la matrícula cuando ya existe', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'GET /infantes': () => jsonResponse(200, { children: [] }),
        'GET /salas': () => jsonResponse(200, rooms),
        'POST /infantes': () => jsonResponse(409, { error: { code: 'CONFLICTO', message: 'Ya existe un infante con esa matrícula o CURP.' } }),
      }),
    );
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo infante' }));
    await userEvent.type(screen.getByLabelText('Matrícula'), 'M-0001');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Infante');
    await userEvent.type(screen.getByLabelText('Apellido paterno'), 'Prueba');
    await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2025-03-10');
    await userEvent.selectOptions(await screen.findByLabelText('Sala'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar infante' }));
    expect(await screen.findByText('Ya existe un infante con esa matrícula o CURP.')).toBeInTheDocument();
  });
});
