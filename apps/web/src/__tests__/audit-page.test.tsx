import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditPage } from '../features/audit/pages/audit-page';
import { docenteSession, renderWithSession } from './test-utils';

const adminSession = {
  ...docenteSession,
  assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null, estanciaName: null }],
  activeEstancia: null,
  permissions: ['AUDITORIA_CONSULTAR' as const, 'USUARIO_ADMINISTRAR' as const],
};

const entry = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  occurredAt: '2026-10-18T15:30:00.000Z',
  userId: 3,
  userName: 'Directora Prueba',
  roleCode: 'DIRECTORA',
  action: 'INFANTE_ACTUALIZADO',
  tableName: 'infantes',
  recordId: '12',
  ipAddress: '10.0.0.5',
  userAgent: 'Mozilla/5.0',
  changedFields: ['name', 'birthDate'],
  ...overrides,
});

const users = { users: [{ id: 3, name: 'Directora Prueba', email: 'directora@sirai.test', status: 'ACTIVO', assignments: [{ role: 'DIRECTORA', estanciaId: 1 }], lastAccessAt: null }] };
const filters = { actions: ['INFANTE_ACTUALIZADO', 'LOGIN'], tables: ['infantes', 'usuarios'] };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const withAudit = (pages: Array<{ entries: unknown[]; nextBeforeId: number | null }>) => {
  let call = 0;
  return vi.fn((url: string) => {
    const path = new URL(url).pathname;
    if (path === '/usuarios') return Promise.resolve(jsonResponse(200, users));
    if (path === '/auditoria/filtros') return Promise.resolve(jsonResponse(200, filters));
    if (path === '/auditoria') {
      const page = pages[Math.min(call, pages.length - 1)];
      call += 1;
      return Promise.resolve(jsonResponse(200, page));
    }
    return Promise.resolve(jsonResponse(404, { error: { code: 'NO_ENCONTRADO', message: 'x' } }));
  });
};

const auditCalls = (fetchMock: ReturnType<typeof withAudit>): URL[] =>
  fetchMock.mock.calls.map(([url]) => new URL(url)).filter((url) => url.pathname === '/auditoria');

describe('pantalla de auditoría (RF-11)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista quién, cuándo, qué acción, sobre qué registro, qué campos y desde dónde', async () => {
    vi.stubGlobal('fetch', withAudit([{ entries: [entry(2)], nextBeforeId: null }]));
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    const row = (await screen.findByText('Directora Prueba', { selector: 'p' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('Directora de estancia')).toBeInTheDocument();
    expect(within(row).getByText('INFANTE_ACTUALIZADO')).toBeInTheDocument();
    expect(within(row).getByText('infantes · 12')).toBeInTheDocument();
    expect(within(row).getByText('birthDate')).toBeInTheDocument();
    expect(within(row).getByText('name')).toBeInTheDocument();
    expect(within(row).getByText('10.0.0.5')).toBeInTheDocument();
  });

  it('aclara que solo se ven los nombres de los campos, no sus valores', async () => {
    vi.stubGlobal('fetch', withAudit([{ entries: [entry(2)], nextBeforeId: null }]));
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    expect(await screen.findByText(/solo los nombres de los campos que cambiaron, no sus valores/)).toBeInTheDocument();
  });

  it('un registro sin persona (acceso fallido de un correo inexistente) y sin cambios se muestra igual', async () => {
    vi.stubGlobal('fetch', withAudit([{ entries: [entry(2, { userId: null, userName: null, roleCode: null, action: 'LOGIN_FALLIDO', tableName: 'usuarios', recordId: null, ipAddress: null, changedFields: [] })], nextBeforeId: null }]));
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    expect(await screen.findByText('LOGIN_FALLIDO')).toBeInTheDocument();
    expect(screen.getByText('Sin persona')).toBeInTheDocument();
  });

  it('sin registros dice que no hay resultados, y si falla lo avisa', async () => {
    vi.stubGlobal('fetch', withAudit([{ entries: [], nextBeforeId: null }]));
    const { unmount } = renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    expect(await screen.findByText('Sin registros con esos filtros')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new URL(url).pathname === '/auditoria' ? jsonResponse(500, { error: { code: 'ERROR_INTERNO', message: 'x' } }) : jsonResponse(200, new URL(url).pathname === '/usuarios' ? users : filters))));
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la bitácora.');
  });

  it('pide la página siguiente con el cursor y la agrega; el botón desaparece al terminar', async () => {
    const fetchMock = withAudit([
      { entries: [entry(9, { action: 'LOGIN' })], nextBeforeId: 9 },
      { entries: [entry(4, { action: 'LOGOUT' })], nextBeforeId: null },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    await screen.findByText('LOGIN', { selector: 'p' });
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('LOGOUT', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('LOGIN', { selector: 'p' })).toBeInTheDocument();
    expect(auditCalls(fetchMock)[1]?.searchParams.get('beforeId')).toBe('9');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('los filtros llenan sus opciones con lo que existe y se mandan al aplicarlos', async () => {
    const fetchMock = withAudit([{ entries: [entry(2)], nextBeforeId: null }]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    await screen.findByText('INFANTE_ACTUALIZADO', { selector: 'td *, td' });
    await user.selectOptions(await screen.findByLabelText('Acción'), 'LOGIN');
    await user.selectOptions(screen.getByLabelText('Persona'), '3');
    await user.selectOptions(screen.getByLabelText('Tabla'), 'usuarios');
    await user.type(screen.getByLabelText('Registro'), '5');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(auditCalls(fetchMock).length).toBe(2));
    const params = auditCalls(fetchMock)[1]?.searchParams;
    expect(params?.get('action')).toBe('LOGIN');
    expect(params?.get('userId')).toBe('3');
    expect(params?.get('table')).toBe('usuarios');
    expect(params?.get('recordId')).toBe('5');
  });

  it('las fechas se mandan como el inicio del día local y el final del día local', async () => {
    const fetchMock = withAudit([{ entries: [entry(2)], nextBeforeId: null }]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    await screen.findByText('Directora Prueba', { selector: 'p' });
    await user.type(screen.getByLabelText('Desde'), '2026-10-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-10-02');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(auditCalls(fetchMock).length).toBe(2));
    const params = auditCalls(fetchMock)[1]?.searchParams;
    expect(params?.get('from')).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).toISOString());
    expect(params?.get('to')).toBe(new Date(2026, 9, 2, 23, 59, 59, 999).toISOString());
  });

  it('avisa si el rango está invertido y no consulta', async () => {
    const fetchMock = withAudit([{ entries: [entry(2)], nextBeforeId: null }]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    await screen.findByText('Directora Prueba', { selector: 'p' });
    await user.type(screen.getByLabelText('Desde'), '2026-10-05');
    await user.type(screen.getByLabelText('Hasta'), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha inicial no puede ser posterior a la final.');
    expect(auditCalls(fetchMock)).toHaveLength(1);
  });

  it('limpiar quita los filtros y vuelve a la primera página', async () => {
    const fetchMock = withAudit([{ entries: [entry(2)], nextBeforeId: null }]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithSession(<AuditPage />, adminSession, '/app/auditoria');
    await screen.findByRole('option', { name: 'LOGIN' });
    await user.selectOptions(screen.getByLabelText('Acción'), 'LOGIN');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(auditCalls(fetchMock).length).toBe(2));
    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(auditCalls(fetchMock).length).toBe(3));
    expect(auditCalls(fetchMock)[2]?.searchParams.has('action')).toBe(false);
    expect(screen.getByLabelText('Acción')).toHaveValue('');
  });
});
