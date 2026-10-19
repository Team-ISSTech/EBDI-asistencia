import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSession, useSessionActions } from '../features/auth/use-session';
import { sharedOfflineRuntime } from '../offline/runtime';
import { docenteSession, renderWithSession } from './test-utils';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function Probe() {
  const session = useSession();
  const { logout } = useSessionActions();
  const label = session.isPending ? 'cargando' : session.isError ? 'error' : session.data ? `hola ${session.data.user.name}` : 'sin sesión';
  return (
    <div>
      <p>{label}</p>
      <button type="button" onClick={() => logout.mutate()}>
        Salir
      </button>
    </div>
  );
}

const mount = () => renderWithSession(<Probe />, undefined, '/app');

describe('sesión sin conexión (RF-20)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('al consultar la sesión con éxito guarda una copia cifrada para la próxima vez', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, docenteSession)));
    mount();
    expect(await screen.findByText('hola Docente Prueba')).toBeInTheDocument();
    await waitFor(async () => expect(await sharedOfflineRuntime().snapshot.load()).toEqual(docenteSession));
  });

  it('sin conexión, abre con la última sesión conocida', async () => {
    await sharedOfflineRuntime().snapshot.save(docenteSession);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mount();
    expect(await screen.findByText('hola Docente Prueba')).toBeInTheDocument();
  });

  it('con el servidor caído (503) también abre con la última sesión conocida', async () => {
    await sharedOfflineRuntime().snapshot.save(docenteSession);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, { error: { code: 'ERROR_INTERNO', message: 'x' } })));
    mount();
    expect(await screen.findByText('hola Docente Prueba')).toBeInTheDocument();
  });

  it('sin conexión y sin sesión guardada no inventa nada: avisa que no se pudo comprobar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mount();
    expect(await screen.findByText('error')).toBeInTheDocument();
  });

  it('si el servidor dice que la sesión ya no vale (401) no se usa la copia y se borra', async () => {
    await sharedOfflineRuntime().snapshot.save(docenteSession);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'NO_AUTENTICADO', message: 'x' } })));
    mount();
    expect(await screen.findByText('sin sesión')).toBeInTheDocument();
    await waitFor(async () => expect(await sharedOfflineRuntime().snapshot.load()).toBeNull());
  });

  it('una copia dañada o con otra forma no se usa', async () => {
    await sharedOfflineRuntime().snapshot.save({ user: 'no es una sesión' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mount();
    expect(await screen.findByText('error')).toBeInTheDocument();
  });

  it('al cerrar sesión se borran la copia de la sesión y lo consultado de esa persona, pero no la cola de capturas', async () => {
    const runtime = sharedOfflineRuntime();
    await runtime.snapshot.save(docenteSession);
    await runtime.cache.put(docenteSession.user.id, 'roster:3', { entries: [] });
    await runtime.cache.put(999, 'roster:3', { entries: ['de otra persona'] });
    await runtime.outbox.enqueue({ userId: docenteSession.user.id, estanciaId: 1, type: 'ATTENDANCE_MARKS', payload: { journeyId: 3, marks: [{ enrollmentId: 1, status: 'PRESENTE', clientId: crypto.randomUUID(), method: 'MANUAL' }] } });
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new URL(url).pathname === '/auth/logout' ? new Response(null, { status: 204 }) : jsonResponse(200, docenteSession))));
    mount();
    await screen.findByText('hola Docente Prueba');
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(async () => expect(await runtime.snapshot.load()).toBeNull());
    expect(await runtime.cache.get(docenteSession.user.id, 'roster:3')).toBeNull();
    expect((await runtime.cache.get(999, 'roster:3'))?.value).toEqual({ entries: ['de otra persona'] });
    expect(await runtime.outbox.counts(docenteSession.user.id)).toMatchObject({ pending: 1 });
  });

  it('un inicio de sesión también deja la copia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, docenteSession)));
    function LoginProbe() {
      const { login } = useSessionActions();
      return (
        <button type="button" onClick={() => login.mutate({ email: 'a@b.mx', password: 'x' })}>
          Entrar
        </button>
      );
    }
    renderWithSession(<LoginProbe />, null);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(async () => expect(await sharedOfflineRuntime().snapshot.load()).toEqual(docenteSession));
  });
});
