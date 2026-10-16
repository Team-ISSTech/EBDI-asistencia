import { describe, expect, it } from 'vitest';
import { SessionService } from '../services/session.service';
import { docenteRecord, InMemorySessions, InMemoryUsers, request, testEnv } from './in-memory';

const MS_PER_HOUR = 3_600_000;

describe('SessionService', () => {
  const setup = () => {
    const users = new InMemoryUsers();
    const sessions = new InMemorySessions();
    const user = users.seed(docenteRecord());
    return { users, sessions, user, service: new SessionService(testEnv, sessions, users) };
  };

  it('guarda solo el hash del token, nunca el token', async () => {
    const { sessions, user, service } = setup();
    const { token, context } = await service.issue(user, request);
    const row = sessions.rows.get(context.sessionId);
    expect(row?.tokenHash).toHaveLength(32);
    expect(row?.tokenHash.toString('base64url')).not.toBe(token);
  });

  it('resuelve un token válido con principal y estancia activa, igual que el contexto emitido', async () => {
    const { user, service } = setup();
    const { token, context } = await service.issue(user, request);
    const auth = await service.resolve(token);
    expect(auth).toEqual(context);
    expect(auth).toMatchObject({ userId: user.id, activeEstanciaId: 1 });
    expect(auth?.principal.assignments).toEqual([{ role: 'DOCENTE', estanciaId: 1, region: null }]);
  });

  it('no resuelve tokens expirados ni desconocidos', async () => {
    const { user, service } = setup();
    const issuedAt = new Date('2026-10-07T08:00:00Z');
    const { token } = await service.issue(user, request, issuedAt);
    const afterTtl = new Date(issuedAt.getTime() + (testEnv.SESSION_TTL_HOURS + 1) * MS_PER_HOUR);
    expect(await service.resolve(token, afterTtl)).toBeNull();
    expect(await service.resolve('token-inventado', issuedAt)).toBeNull();
  });

  it('extiende la expiración con el uso (deslizante) pero no más allá del tope absoluto', async () => {
    const { sessions, user, service } = setup();
    const issuedAt = new Date('2026-10-07T08:00:00Z');
    const { token, context } = await service.issue(user, request, issuedAt);
    const later = new Date(issuedAt.getTime() + 6 * MS_PER_HOUR);
    await service.resolve(token, later);
    expect(sessions.rows.get(context.sessionId)?.expiresAt).toEqual(
      new Date(later.getTime() + testEnv.SESSION_TTL_HOURS * MS_PER_HOUR),
    );
  });

  it('el tope absoluto gana aunque la inactividad permitida sea mayor', async () => {
    const users = new InMemoryUsers();
    const sessions = new InMemorySessions();
    const user = users.seed(docenteRecord());
    const service = new SessionService({ ...testEnv, SESSION_TTL_HOURS: 100 }, sessions, users);
    const issuedAt = new Date('2026-10-07T08:00:00Z');
    const { token, context } = await service.issue(user, request, issuedAt);
    const nearCap = new Date(issuedAt.getTime() + (testEnv.SESSION_MAX_HOURS - 1) * MS_PER_HOUR);
    expect(await service.resolve(token, nearCap)).not.toBeNull();
    expect(sessions.rows.get(context.sessionId)?.expiresAt).toEqual(
      new Date(issuedAt.getTime() + testEnv.SESSION_MAX_HOURS * MS_PER_HOUR),
    );
    expect(await service.resolve(token, new Date(issuedAt.getTime() + (testEnv.SESSION_MAX_HOURS + 1) * MS_PER_HOUR))).toBeNull();
  });

  it('no escribe en la base si el último uso fue hace menos de un minuto', async () => {
    const { sessions, user, service } = setup();
    const issuedAt = new Date('2026-10-07T08:00:00Z');
    const { token, context } = await service.issue(user, request, issuedAt);
    const before = sessions.rows.get(context.sessionId)?.expiresAt;
    await service.resolve(token, new Date(issuedAt.getTime() + 30_000));
    expect(sessions.rows.get(context.sessionId)?.expiresAt).toEqual(before);
  });

  it('no resuelve sesiones de usuarios desactivados después de iniciar', async () => {
    const { users, user, service } = setup();
    const { token } = await service.issue(user, request);
    users.rows.set(user.id, { ...user, status: 'INACTIVO' });
    expect(await service.resolve(token)).toBeNull();
  });
});
