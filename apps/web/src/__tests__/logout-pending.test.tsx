import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../app/shell/app-shell';
import { type OfflineApi, OfflineContext } from '../offline/offline-api';
import { docenteSession, renderWithSession } from './test-utils';

const api = (overrides: Partial<OfflineApi> = {}): OfflineApi => ({
  online: true,
  counts: { pending: 0, review: 0, others: 0 },
  syncing: false,
  staleData: false,
  cached: (_name, load) => load(),
  enqueue: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(null),
  review: vi.fn().mockResolvedValue([]),
  discard: vi.fn().mockResolvedValue(true),
  pendingMarks: vi.fn().mockResolvedValue(new Map()),
  ...overrides,
});

const shell = (value: OfflineApi) =>
  renderWithSession(
    <OfflineContext.Provider value={value}>
      <AppShell />
    </OfflineContext.Provider>,
    docenteSession,
    '/app',
  );

describe('cerrar sesión con capturas sin enviar (RF-23: sin pérdida de datos)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin nada pendiente cierra la sesión directamente, como siempre', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    shell(api());
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(screen.getByText('Pantalla de inicio de sesión')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('con capturas pendientes avisa antes de cerrar y no cierra todavía', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    shell(api({ counts: { pending: 2, review: 0, others: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByText(/Tienes 2 capturas sin enviar/)).toBeInTheDocument();
    expect(screen.getByText(/Se conservan cifradas en esta tablet y se enviarán cuando vuelvas a iniciar sesión con tu cuenta/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Pantalla de inicio de sesión')).toBeNull();
  });

  it('con conexión ofrece enviarlas antes de salir', async () => {
    const syncNow = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn());
    shell(api({ counts: { pending: 1, review: 0, others: 0 }, syncNow }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByText(/Tienes 1 captura sin enviar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar ahora y salir' }));
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('sin conexión no ofrece enviar y lo explica', async () => {
    vi.stubGlobal('fetch', vi.fn());
    shell(api({ online: false, counts: { pending: 3, review: 0, others: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.queryByRole('button', { name: 'Enviar ahora y salir' })).toBeNull();
    expect(screen.getByText(/Sin conexión no se pueden enviar ahora/)).toBeInTheDocument();
  });

  it('puede cerrar de todos modos: las capturas no se pierden', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    shell(api({ counts: { pending: 2, review: 0, others: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión de todos modos' }));
    await waitFor(() => expect(screen.getByText('Pantalla de inicio de sesión')).toBeInTheDocument());
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/auth\/logout$/);
  });

  it('cancelar se queda en la sesión', async () => {
    vi.stubGlobal('fetch', vi.fn());
    shell(api({ counts: { pending: 2, review: 0, others: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(/Tienes 2 capturas sin enviar/)).toBeNull();
    expect(screen.getByText('Docente Prueba')).toBeInTheDocument();
  });

  it('lo que requiere revisión también cuenta como algo que no se debe perder sin avisar', async () => {
    vi.stubGlobal('fetch', vi.fn());
    shell(api({ counts: { pending: 0, review: 1, others: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByText(/1 captura por revisar/)).toBeInTheDocument();
  });
});
