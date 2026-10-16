import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowUpsPage } from '../features/follow-ups/pages/follow-ups-page';
import { docenteSession, renderWithSession } from './test-utils';

const socialWorkSession = {
  ...docenteSession,
  assignments: [{ role: 'TRABAJO_SOCIAL' as const, estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  permissions: ['SEGUIMIENTO_CONSULTAR' as const, 'SEGUIMIENTO_REGISTRAR' as const],
};

const ticket = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
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
  openedAt: '2026-10-15T15:00:00.000Z',
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const rowOf = async (name: string): Promise<HTMLElement> => {
  const row = (await screen.findByText(name)).closest('tr');
  if (!row) throw new Error(`Sin fila para ${name}`);
  return row;
};

describe('FollowUpsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista los tickets abiertos con la ausencia, el estado y la causa', async () => {
    const classified = ticket({ id: 2, childName: 'Infante Dos Prueba', absenceStatus: 'AUSENTE_JUSTIFICADO', status: 'CLASIFICADO', cause: 'ENF_CASA', expectedReturnDate: '2026-10-20', requiresMedicalRelease: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { followUps: [ticket(), classified] })));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    const open = within(await rowOf('Infante Uno Prueba'));
    expect(open.getByText('Falta injustificada')).toBeInTheDocument();
    expect(open.getByText('Sin clasificar')).toBeInTheDocument();
    const closed = within(await rowOf('Infante Dos Prueba'));
    expect(closed.getByText('Ausente justificado')).toBeInTheDocument();
    expect(closed.getByText('Enfermedad en casa')).toBeInTheDocument();
    expect(closed.getByText('Requiere alta médica')).toBeInTheDocument();
    expect(closed.getByText('2026-10-20')).toBeInTheDocument();
  });

  it('muestra un estado vacío cuando no hay tickets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { followUps: [] })));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    expect(await screen.findByText('Sin seguimientos pendientes')).toBeInTheDocument();
  });

  it('avisa si la bandeja no carga', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } })));
    renderWithSession(<FollowUpsPage />, socialWorkSession, '/app/seguimientos');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la bandeja de seguimientos.');
  });
});
