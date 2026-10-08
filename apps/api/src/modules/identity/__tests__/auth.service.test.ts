import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { docenteRecord, FakeHasher, InMemoryEstancias, InMemorySessions, InMemoryUsers, RecordingAudit, request, testEnv } from './in-memory';

const estancias = [
  { id: 1, name: 'Estancia 1' },
  { id: 2, name: 'Estancia 2' },
];

describe('AuthService', () => {
  let users: InMemoryUsers;
  let sessions: InMemorySessions;
  let audit: RecordingAudit;
  let service: AuthService;

  beforeEach(() => {
    users = new InMemoryUsers();
    sessions = new InMemorySessions();
    audit = new RecordingAudit();
    const sessionService = new SessionService(testEnv, sessions, users);
    service = new AuthService(testEnv, users, new InMemoryEstancias(estancias), new FakeHasher(), sessionService, audit.asService());
  });

  it('inicia sesión con credenciales correctas, activa la estancia predeterminada y audita LOGIN', async () => {
    users.seed(docenteRecord());
    const result = await service.login({ email: 'docente@sirai.test', password: 'correcta' }, request);
    expect(result.token).toHaveLength(43);
    expect(result.session.activeEstancia).toEqual({ id: 1, name: 'Estancia 1' });
    expect(result.session.permissions).toEqual(expect.arrayContaining(['ASISTENCIA_REGISTRAR']));
    expect(result.session.availableEstancias).toEqual([{ id: 1, name: 'Estancia 1' }]);
    expect(audit.entries.map((e) => e.action)).toEqual(['LOGIN']);
    expect(audit.entries[0]?.roleCode).toBe('DOCENTE');
    expect(audit.transactional).toBe(1);
  });

  it('rechaza contraseña incorrecta con CREDENCIALES_INVALIDAS y audita el fallo', async () => {
    users.seed(docenteRecord());
    await expect(service.login({ email: 'docente@sirai.test', password: 'mala' }, request)).rejects.toMatchObject({
      code: 'CREDENCIALES_INVALIDAS',
    });
    expect(audit.entries.map((e) => e.action)).toEqual(['LOGIN_FALLIDO']);
  });

  it('responde igual para un correo inexistente que para contraseña incorrecta y audita el intento', async () => {
    await expect(service.login({ email: 'nadie@sirai.test', password: 'x' }, request)).rejects.toMatchObject({
      code: 'CREDENCIALES_INVALIDAS',
      message: 'Correo o contraseña incorrectos.',
    });
    expect(audit.entries.at(-1)).toMatchObject({ action: 'LOGIN_FALLIDO', userId: null, after: { motivo: 'INEXISTENTE' } });
  });

  it('bloquea al llegar al máximo de intentos sin revelarlo a quien no conoce la contraseña', async () => {
    const user = users.seed(docenteRecord());
    const attempt = () => service.login({ email: user.email, password: 'mala' }, request).catch((e: { code: string }) => e.code);
    expect(await attempt()).toBe('CREDENCIALES_INVALIDAS');
    expect(await attempt()).toBe('CREDENCIALES_INVALIDAS');
    expect(await attempt()).toBe('CREDENCIALES_INVALIDAS');
    expect(audit.entries.at(-1)?.action).toBe('CUENTA_BLOQUEADA');
    expect(users.rows.get(user.id)?.lockedUntil).toBeInstanceOf(Date);
  });

  it('con la contraseña correcta y la cuenta bloqueada responde CUENTA_BLOQUEADA sin contar intento', async () => {
    const future = new Date(Date.now() + 60_000);
    const user = users.seed(docenteRecord({ lockedUntil: future }));
    await expect(service.login({ email: user.email, password: 'correcta' }, request)).rejects.toMatchObject({ code: 'CUENTA_BLOQUEADA' });
    await expect(service.login({ email: user.email, password: 'mala' }, request)).rejects.toMatchObject({ code: 'CREDENCIALES_INVALIDAS' });
    expect(users.rows.get(user.id)?.failedAttempts).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('permite entrar cuando el bloqueo ya venció', async () => {
    const past = new Date(Date.now() - 1000);
    users.seed(docenteRecord({ lockedUntil: past }));
    await expect(service.login({ email: 'docente@sirai.test', password: 'correcta' }, request)).resolves.toBeDefined();
  });

  it('rechaza usuarios inactivos sin revelar que existen', async () => {
    users.seed(docenteRecord({ status: 'INACTIVO' }));
    await expect(service.login({ email: 'docente@sirai.test', password: 'correcta' }, request)).rejects.toMatchObject({
      code: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('un rol central entra sin estancia activa y ve todas las estancias', async () => {
    users.seed(
      docenteRecord({
        email: 'admin@sirai.test',
        defaultEstanciaId: null,
        assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null, estanciaName: null }],
      }),
    );
    const { session } = await service.login({ email: 'admin@sirai.test', password: 'correcta' }, request);
    expect(session.activeEstancia).toBeNull();
    expect(session.availableEstancias).toHaveLength(2);
    expect(session.permissions).toContain('USUARIO_ADMINISTRAR');
  });

  it('cambia de estancia solo a una asignada y audita el cambio', async () => {
    users.seed(
      docenteRecord({
        assignments: [
          { role: 'DOCENTE', estanciaId: 1, estanciaName: 'Estancia 1' },
          { role: 'DOCENTE', estanciaId: 2, estanciaName: 'Estancia 2' },
        ],
      }),
    );
    const { token } = await service.login({ email: 'docente@sirai.test', password: 'correcta' }, request);
    const auth = await new SessionService(testEnv, sessions, users).resolve(token);
    if (!auth) throw new Error('sesión no resuelta');
    const switched = await service.switchEstancia(auth, 2, request);
    expect(switched.activeEstancia?.id).toBe(2);
    await expect(service.switchEstancia(auth, 99, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    expect(audit.entries.at(-1)).toMatchObject({ action: 'CAMBIO_ESTANCIA', before: { estanciaId: 1 }, after: { estanciaId: 2 } });
  });

  it('logout revoca la sesión y audita LOGOUT', async () => {
    users.seed(docenteRecord());
    const { token } = await service.login({ email: 'docente@sirai.test', password: 'correcta' }, request);
    const resolver = new SessionService(testEnv, sessions, users);
    const auth = await resolver.resolve(token);
    if (!auth) throw new Error('sesión no resuelta');
    await service.logout(auth, request);
    expect(await resolver.resolve(token)).toBeNull();
    expect(audit.entries.at(-1)?.action).toBe('LOGOUT');
    expect(audit.transactional).toBe(audit.entries.length);
  });
});
