import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RollCallPage } from '../features/attendance/pages/roll-call-page';
import { docenteSession, renderWithSession } from './test-utils';

const TODAY = new Date().toLocaleDateString('en-CA');
const journey = { id: 3, estanciaId: 1, date: TODAY, shift: 'MATUTINO', status: 'ABIERTA', openedAt: '2026-10-15T13:00:00.000Z', closedAt: null };

const entry = (n: number, extra: Record<string, unknown>) => ({
  enrollmentId: n,
  childId: n,
  childName: `Infante ${n} Prueba`,
  enrollmentNumber: `M-${n}`,
  roomId: 1,
  roomName: 'Lactantes (prueba)',
  status: 'PRESENTE',
  medicalLock: false,
  ...extra,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const mount = (entries: unknown[]) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const routes: Record<string, () => Response> = {
        'GET /asistencia/jornadas/activa': () => jsonResponse(200, journey),
        'GET /asistencia/jornadas/3/lista': () => jsonResponse(200, { entries }),
        'GET /asistencia/jornadas/3/registros/2/incidencias': () => jsonResponse(200, { incidents: [{ id: 9, type: 'ENFERMEDAD', description: null, recordedAt: '2026-10-15T15:00:00.000Z' }] }),
      };
      const handler = routes[`${init?.method ?? 'GET'} ${new URL(url).pathname}`];
      return Promise.resolve(handler ? handler() : jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
    }),
  );
  renderWithSession(<RollCallPage />, docenteSession, '/app/pase-de-lista');
};

const rowOf = async (name: string): Promise<HTMLElement> => {
  const row = (await screen.findByText(name, { selector: 'p' })).closest('tr');
  if (!row) throw new Error(`Sin fila para ${name}`);
  return row;
};

describe('salida e incidencias en la lista (S-27)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('con la salida registrada, los botones de estado de ese infante quedan desactivados', async () => {
    mount([entry(1, { leftAt: '2026-10-15T20:00:00.000Z' }), entry(2, {})]);
    const left = await rowOf('Infante 1 Prueba');
    for (const button of within(within(left).getByRole('group')).getAllByRole('button')) expect(button).toBeDisabled();
    expect(within(left).getByText(/Salió \d{2}:\d{2}/)).toBeInTheDocument();
    const stays = await rowOf('Infante 2 Prueba');
    expect(within(stays).getByRole('button', { name: 'Falta injustificada' })).toBeEnabled();
  });

  it('las incidencias siguen a la vista aunque el infante ya no esté Presente, sin poder registrar más', async () => {
    const user = userEvent.setup();
    mount([entry(2, { status: 'COMISION_MEDICA', incidentCount: 1 }), entry(3, { status: 'FALTA_INJUSTIFICADA' })]);
    const row = await rowOf('Infante 2 Prueba');
    expect(within(await rowOf('Infante 3 Prueba')).queryByRole('button', { name: /Salida e incidencias/ })).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'Salida e incidencias de Infante 2 Prueba' }));
    expect(await screen.findByText('Enfermedad')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar incidencia' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar salida' })).toBeNull();
  });
});
