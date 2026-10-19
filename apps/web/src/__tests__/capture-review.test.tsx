import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CaptureReviewPage } from '../offline/capture-review-page';
import { type OfflineApi, OfflineContext } from '../offline/offline-api';
import type { ReviewItem } from '../offline/outbox';
import { docenteSession, renderWithSession } from './test-utils';

const marksItem = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({
  operationId: '00000000-0000-4000-8000-000000000001',
  type: 'ATTENDANCE_MARKS',
  status: 'PARCIAL',
  capturedAt: '2026-10-18T14:30:00.000Z',
  failure: { code: null, message: null, rejections: [{ ref: 5, code: 'CANDADO_MEDICO', message: 'Requiere alta médica.' }] },
  payload: {
    journeyId: 3,
    marks: [
      { enrollmentId: 4, status: 'PRESENTE', clientId: '00000000-0000-4000-8000-0000000000a4', method: 'QR' },
      { enrollmentId: 5, status: 'PRESENTE', clientId: '00000000-0000-4000-8000-0000000000a5', method: 'MANUAL' },
    ],
  },
  ...overrides,
});

const contactItem: ReviewItem = {
  operationId: '00000000-0000-4000-8000-000000000002',
  type: 'FOLLOW_UP_CONTACT',
  status: 'RECHAZADA',
  capturedAt: '2026-10-18T15:00:00.000Z',
  failure: { code: 'CONFLICTO', message: 'El seguimiento ya está cerrado.', rejections: [] },
  payload: { followUpId: 9, contact: { result: 'CONTACTADO', guardianId: 1, cause: 'ENF_CASA', expectedReturnDate: '2026-10-25', notes: 'Tiene fiebre desde ayer.' } },
};

const api = (items: ReviewItem[], overrides: Partial<OfflineApi> = {}): OfflineApi => ({
  online: true,
  counts: { pending: 0, review: items.length, others: 0 },
  syncing: false,
  enqueue: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(null),
  review: vi.fn().mockResolvedValue(items),
  discard: vi.fn().mockResolvedValue(true),
  pendingMarks: vi.fn().mockResolvedValue(new Map()),
  ...overrides,
});

const show = (value: OfflineApi) =>
  renderWithSession(
    <OfflineContext.Provider value={value}>
      <CaptureReviewPage />
    </OfflineContext.Provider>,
    docenteSession,
    '/app/capturas',
  );

describe('pantalla de revisión de capturas (RF-23, S-20)', () => {
  it('sin nada que revisar lo dice', async () => {
    show(api([]));
    expect(await screen.findByText('No hay capturas por revisar')).toBeInTheDocument();
  });

  it('explica para qué sirve: reconciliar con el formato físico de respaldo', async () => {
    show(api([marksItem()]));
    expect(await screen.findByText(/formato físico de respaldo/)).toBeInTheDocument();
  });

  it('un pase de lista parcial muestra lo capturado, cuándo y lo que no se aplicó con su motivo', async () => {
    show(api([marksItem()]));
    const card = (await screen.findByText('Pase de lista')).closest('article') as HTMLElement;
    expect(within(card).getByText('Se aplicó en parte')).toBeInTheDocument();
    expect(within(card).getByText('Infante n.º 4: Presente')).toBeInTheDocument();
    expect(within(card).getByText('Infante n.º 5: Presente')).toBeInTheDocument();
    const rejected = within(card).getByText('Infante n.º 5: Presente').closest('li') as HTMLElement;
    expect(within(rejected).getByText('No se aplicó: Requiere alta médica.')).toBeInTheDocument();
    const applied = within(card).getByText('Infante n.º 4: Presente').closest('li') as HTMLElement;
    expect(within(applied).queryByText(/No se aplicó/)).toBeNull();
  });

  it('una llamada rechazada muestra el motivo y todo lo capturado, incluidas las notas, para volver a registrarla', async () => {
    show(api([contactItem]));
    const card = (await screen.findByText('Llamada de seguimiento')).closest('article') as HTMLElement;
    expect(within(card).getByText('No se aplicó nada')).toBeInTheDocument();
    expect(within(card).getByText('El seguimiento ya está cerrado.')).toBeInTheDocument();
    expect(within(card).getByText(/Enfermedad en casa/)).toBeInTheDocument();
    expect(within(card).getByText('Tiene fiebre desde ayer.')).toBeInTheDocument();
  });

  it('una captura que ya no se puede leer lo dice', async () => {
    show(api([marksItem({ status: 'RECHAZADA', payload: null, failure: { code: 'ILEGIBLE', message: 'Esta captura ya no se puede leer en la tablet.', rejections: [] } })]));
    expect(await screen.findByText('Esta captura ya no se puede leer en la tablet.')).toBeInTheDocument();
    expect(screen.getByText('No se puede mostrar lo capturado.')).toBeInTheDocument();
  });

  it('descartar pide confirmación explícita, advierte que no se recupera y solo entonces borra', async () => {
    const discard = vi.fn().mockResolvedValue(true);
    show(api([contactItem], { discard }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Descartar la captura revisada' }));
    expect(screen.getByText(/Solo hazlo después de reconciliarla con el formato físico/)).toBeInTheDocument();
    expect(discard).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar descarte' }));
    expect(screen.queryByText(/Solo hazlo después de reconciliarla/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Descartar la captura revisada' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar descarte' }));
    expect(discard).toHaveBeenCalledWith(contactItem.operationId);
  });

  it('tras descartar, la captura desaparece de la lista', async () => {
    let items = [contactItem];
    const discard = vi.fn(() => {
      items = [];
      return Promise.resolve(true);
    });
    show(api(items, { discard, review: vi.fn(() => Promise.resolve(items)) }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Descartar la captura revisada' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar descarte' }));
    expect(await screen.findByText('No hay capturas por revisar')).toBeInTheDocument();
  });
});
