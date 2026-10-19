import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionBanner } from '../offline/connection-banner';
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

const show = (value: OfflineApi) =>
  renderWithSession(
    <OfflineContext.Provider value={value}>
      <ConnectionBanner />
    </OfflineContext.Provider>,
    docenteSession,
    '/app/pase-de-lista',
  );

describe('ConnectionBanner (RF-20 a RF-23)', () => {
  it('con conexión y nada pendiente no muestra nada', () => {
    const { container } = show(api());
    expect(container).toBeEmptyDOMElement();
  });

  it('sin el proveedor de capturas sin conexión no hace nada ni revienta', () => {
    const { container } = renderWithSession(<ConnectionBanner />, docenteSession, '/app/pase-de-lista');
    expect(container).toBeEmptyDOMElement();
  });

  it('sin conexión explica que lo capturado se guarda en la tablet y se envía solo', () => {
    show(api({ online: false }));
    expect(screen.getByRole('status')).toHaveTextContent('Sin conexión. Lo que captures se guarda en esta tablet y se enviará solo cuando vuelva la conexión.');
  });

  it('sin conexión y con capturas guardadas, dice cuántas', () => {
    show(api({ online: false, counts: { pending: 3, review: 0, others: 0 } }));
    expect(screen.getByRole('status')).toHaveTextContent('3 capturas pendientes de enviar.');
  });

  it('con conexión y pendientes ofrece enviar ahora', async () => {
    const syncNow = vi.fn().mockResolvedValue(null);
    show(api({ counts: { pending: 1, review: 0, others: 0 }, syncNow }));
    expect(screen.getByRole('status')).toHaveTextContent('1 captura pendiente de enviar.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar ahora' }));
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('mientras envía lo dice y no ofrece enviar de nuevo', () => {
    show(api({ syncing: true, counts: { pending: 2, review: 0, others: 0 } }));
    expect(screen.getByRole('status')).toHaveTextContent('Enviando capturas…');
    expect(screen.queryByRole('button', { name: 'Enviar ahora' })).toBeNull();
  });

  it('lo que requiere revisión lleva a la pantalla de revisión', () => {
    show(api({ counts: { pending: 0, review: 2, others: 0 } }));
    expect(screen.getByRole('status')).toHaveTextContent('2 capturas requieren revisión.');
    expect(screen.getByRole('link', { name: 'Revisar' })).toHaveAttribute('href', '/app/capturas');
  });

  it('avisa de las capturas de otra persona en esta tablet, sin más datos', () => {
    show(api({ counts: { pending: 0, review: 0, others: 4 } }));
    expect(screen.getByRole('status')).toHaveTextContent('Hay 4 capturas de otra persona en esta tablet; se enviarán cuando inicie sesión.');
  });

  it('si lo que se ve viene de la copia guardada, lo avisa aunque haya conexión', () => {
    show(api({ staleData: true }));
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando datos guardados en esta tablet; pueden no estar al día.');
  });

  it('en singular y plural', () => {
    show(api({ counts: { pending: 0, review: 1, others: 1 } }));
    expect(screen.getByRole('status')).toHaveTextContent('1 captura requiere revisión.');
    expect(screen.getByRole('status')).toHaveTextContent('Hay 1 captura de otra persona');
  });
});
