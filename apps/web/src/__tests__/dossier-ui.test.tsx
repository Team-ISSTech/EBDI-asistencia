import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildrenPage } from '../features/children/pages/children-page';
import { docenteSession, renderWithSession } from './test-utils';

const directoraSession = {
  ...docenteSession,
  assignments: [{ role: 'DIRECTORA' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: [...docenteSession.permissions, 'INFANTE_ADMINISTRAR' as const, 'EXPEDIENTE_EXPORTAR' as const],
};

const child = {
  id: 5,
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

const SEAL = 'ab'.repeat(32);
const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routeFetch = (handlers: Record<string, () => Response>) => {
  const all: Record<string, () => Response> = { 'GET /infantes': () => jsonResponse(200, { children: [child] }), ...handlers };
  return vi.fn((url: string, init?: RequestInit) => {
    const handler = all[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
    return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });
};

describe('expediente para traslados (RF-19)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  /** jsdom no implementa las URL de objetos: se definen para la prueba y se quitan al terminar. */
  const setupDownload = () => {
    const click = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:expediente') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
    const originalCreate = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const element = originalCreate(tag, options);
      if (tag === 'a') {
        anchors.push(element as HTMLAnchorElement);
        (element as HTMLAnchorElement).click = click;
      }
      return element;
    });
    return { click, anchors };
  };

  it('quien no puede exportar no ve el botón ni la verificación', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    renderWithSession(<ChildrenPage />, docenteSession, '/app/infantes');
    await screen.findByText('Infante Prueba');
    expect(screen.queryByRole('button', { name: /Expediente de/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verificar expediente' })).toBeNull();
  });

  it('la directora descarga el expediente del infante', async () => {
    const { click, anchors } = setupDownload();
    const fetchMock = routeFetch({ 'GET /expedientes/5': () => new Response('pdf', { status: 200, headers: { 'content-disposition': 'attachment; filename="expediente-EXP-2026-000001.pdf"' } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Expediente de Infante Prueba' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(anchors.at(-1)?.download).toBe('expediente-EXP-2026-000001.pdf');
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).pathname === '/expedientes/5')).toBe(true);
  });

  it('avisa si no se pudo generar el expediente', async () => {
    setupDownload();
    vi.stubGlobal('fetch', routeFetch({ 'GET /expedientes/5': () => jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) }));
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Expediente de Infante Prueba' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el expediente.');
  });

  it('verifica un expediente recibido con su folio y sello', async () => {
    const fetchMock = routeFetch({ 'POST /expedientes/verificar': () => jsonResponse(200, { valid: true, issuedAt: '2026-10-30T12:00:00.000Z', originEstancia: 'Estancia Origen' }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar expediente' }));
    await userEvent.type(screen.getByLabelText('Folio'), 'EXP-2026-000042');
    await userEvent.type(screen.getByLabelText('Sello'), SEAL.toUpperCase());
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(await screen.findByText('Expediente auténtico')).toBeInTheDocument();
    expect(screen.getByText(/Estancia Origen/)).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([url, init]) => new URL(url).pathname === '/expedientes/verificar' && (init as RequestInit).method === 'POST');
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ folio: 'EXP-2026-000042', seal: SEAL.toUpperCase() });
  });

  it('un expediente que no coincide se muestra como no auténtico', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'POST /expedientes/verificar': () => jsonResponse(200, { valid: false }) }));
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar expediente' }));
    await userEvent.type(screen.getByLabelText('Folio'), 'EXP-2026-000042');
    await userEvent.type(screen.getByLabelText('Sello'), SEAL);
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(await screen.findByText('El folio y el sello no coinciden con ningún expediente emitido.')).toBeInTheDocument();
  });

  it('pide folio y sello antes de enviar', async () => {
    const fetchMock = routeFetch({});
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession(<ChildrenPage />, directoraSession, '/app/infantes');
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar expediente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el folio y el sello del expediente.');
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).pathname === '/expedientes/verificar')).toBe(false);
  });
});
