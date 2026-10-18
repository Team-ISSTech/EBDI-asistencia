import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import type { UserRecord } from '../identity.types';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { UsersService } from '../services/users.service';
import { docenteRecord, FakeHasher, InMemoryEstancias, InMemorySessions, InMemoryUsers, RecordingAudit, request, testEnv } from './in-memory';

const NOW = new Date('2026-10-18T12:00:00Z');
const DAY = 86_400_000;

const adminAuth: AuthContext = {
  sessionId: 1,
  userId: 100,
  principal: { userId: 100, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] },
  activeEstanciaId: null,
};

describe('cambio de contraseña (RF-38)', () => {
  let users: InMemoryUsers;
  let sessions: InMemorySessions;
  let audit: RecordingAudit;
  let auth: AuthService;
  let userId: number;

  const patch = (id: number, changes: Partial<UserRecord>) => {
    const current = users.rows.get(id);
    if (current) users.rows.set(id, { ...current, ...changes });
  };

  const contextOf = (id: number, sessionId = 7): AuthContext => ({
    sessionId,
    userId: id,
    principal: { userId: id, assignments: [{ role: 'DOCENTE', estanciaId: 1 }] },
    activeEstanciaId: 1,
  });

  beforeEach(() => {
    users = new InMemoryUsers();
    sessions = new InMemorySessions();
    audit = new RecordingAudit();
    auth = new AuthService(testEnv, users, new InMemoryEstancias([{ id: 1, name: 'Estancia 1' }]), new FakeHasher(), new SessionService(testEnv, sessions, users), audit.asService());
    userId = users.seed(docenteRecord({ passwordHash: 'hash:Temporal-2026', mustChangePassword: true, temporaryPasswordExpiresAt: new Date(NOW.getTime() + DAY) })).id;
  });

  describe('iniciar sesión con una contraseña temporal', () => {
    it('entra, pero la sesión avisa que debe cambiarla y no trae permisos', async () => {
      const result = await auth.login({ email: 'docente@sirai.test', password: 'Temporal-2026' }, request, NOW);
      expect(result.session.mustChangePassword).toBe(true);
      expect(result.session.permissions).toEqual([]);
    });

    it('una contraseña temporal caducada se rechaza con un código propio, sin dar sesión', async () => {
      patch(userId, { temporaryPasswordExpiresAt: new Date(NOW.getTime() - 1000) });
      await expect(auth.login({ email: 'docente@sirai.test', password: 'Temporal-2026' }, request, NOW)).rejects.toMatchObject({ code: 'CONTRASENA_TEMPORAL_CADUCADA' });
      expect(sessions.rows.size).toBe(0);
    });

    it('la caducidad solo se revela a quien conoce la contraseña temporal', async () => {
      patch(userId, { temporaryPasswordExpiresAt: new Date(NOW.getTime() - 1000) });
      await expect(auth.login({ email: 'docente@sirai.test', password: 'incorrecta' }, request, NOW)).rejects.toMatchObject({ code: 'CREDENCIALES_INVALIDAS' });
    });

    it('una contraseña normal no caduca y la sesión no pide cambio', async () => {
      users.seed(docenteRecord({ email: 'normal@sirai.test', passwordHash: 'hash:vieja-pero-valida' }));
      const result = await auth.login({ email: 'normal@sirai.test', password: 'vieja-pero-valida' }, request, NOW);
      expect(result.session.mustChangePassword).toBe(false);
      expect(result.session.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('changePassword', () => {
    it('guarda la contraseña nueva, quita la marca de temporal, conserva solo la sesión actual y lo audita', async () => {
      const session = await auth.changePassword(contextOf(userId), { currentPassword: 'Temporal-2026', newPassword: 'una-clave-nueva-larga' }, request, NOW);
      const stored = users.rows.get(userId);
      expect(stored).toMatchObject({ passwordHash: 'hash:una-clave-nueva-larga', mustChangePassword: false, temporaryPasswordExpiresAt: null });
      expect(users.passwordChanges).toEqual([{ userId, keepSessionId: 7 }]);
      expect(audit.entries[0]).toMatchObject({ action: 'CONTRASENA_CAMBIADA', recordId: String(userId), after: { eraTemporal: true } });
      expect(audit.transactional).toBe(1);
      expect(JSON.stringify(audit.entries)).not.toContain('una-clave-nueva-larga');
      expect(session.mustChangePassword).toBe(false);
      expect(session.permissions.length).toBeGreaterThan(0);
    });

    it('con la contraseña actual incorrecta responde 401, cuenta como intento fallido y no cambia nada', async () => {
      await expect(auth.changePassword(contextOf(userId), { currentPassword: 'mala', newPassword: 'una-clave-nueva-larga' }, request, NOW)).rejects.toMatchObject({
        code: 'CREDENCIALES_INVALIDAS',
        message: 'La contraseña actual es incorrecta.',
      });
      expect(users.rows.get(userId)?.passwordHash).toBe('hash:Temporal-2026');
      expect(users.rows.get(userId)?.failedAttempts).toBe(1);
    });

    it('los intentos fallidos al cambiar la contraseña bloquean la cuenta igual que en el login', async () => {
      const attempt = () => auth.changePassword(contextOf(userId), { currentPassword: 'mala', newPassword: 'una-clave-nueva-larga' }, request, NOW).catch((e: { code: string }) => e.code);
      await attempt();
      await attempt();
      await attempt();
      expect(audit.entries.at(-1)?.action).toBe('CUENTA_BLOQUEADA');
      expect(await attempt()).toBe('CUENTA_BLOQUEADA');
    });

    it('rechaza una contraseña corta o igual a la actual, sin tocar nada', async () => {
      await expect(auth.changePassword(contextOf(userId), { currentPassword: 'Temporal-2026', newPassword: 'corta' }, request, NOW)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
      await expect(auth.changePassword(contextOf(userId), { currentPassword: 'Temporal-2026', newPassword: 'Temporal-2026' }, request, NOW)).rejects.toMatchObject({
        code: 'DATOS_INVALIDOS',
        message: 'La contraseña nueva debe ser distinta de la actual.',
      });
      expect(users.passwordChanges).toHaveLength(0);
      expect(audit.entries.filter((e) => e.action === 'CONTRASENA_CAMBIADA')).toHaveLength(0);
    });

    it('cualquier persona puede cambiarla después, y eraTemporal queda en falso', async () => {
      users.seed(docenteRecord({ email: 'normal@sirai.test', passwordHash: 'hash:vieja-pero-valida' }));
      const normal = (await users.findByEmail('normal@sirai.test'))?.id as number;
      await auth.changePassword(contextOf(normal), { currentPassword: 'vieja-pero-valida', newPassword: 'una-clave-nueva-larga' }, request, NOW);
      expect(audit.entries[0]).toMatchObject({ action: 'CONTRASENA_CAMBIADA', after: { eraTemporal: false } });
    });
  });

  describe('administración de contraseñas temporales', () => {
    let service: UsersService;

    beforeEach(() => {
      service = new UsersService(users, new FakeHasher(), audit.asService(), testEnv);
    });

    it('un usuario nuevo nace con contraseña temporal que caduca en los días configurados', async () => {
      const before = Date.now();
      const created = await service.create(adminAuth, { name: 'Nueva', email: 'nueva@sirai.test', temporaryPassword: 'Temporal-2026', assignments: [{ role: 'DOCENTE', estanciaId: 1 }] }, request);
      const stored = users.rows.get(created.id);
      expect(stored?.mustChangePassword).toBe(true);
      const expiry = stored?.temporaryPasswordExpiresAt?.getTime() ?? 0;
      expect(expiry).toBeGreaterThanOrEqual(before + 7 * DAY);
      expect(expiry).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    });

    it('el administrador restablece la contraseña de otra persona: temporal nueva, desbloqueo y auditoría sin la contraseña', async () => {
      patch(userId, { failedAttempts: 2, lockedUntil: new Date(NOW.getTime() + DAY), mustChangePassword: false, temporaryPasswordExpiresAt: null });
      await service.resetPassword(adminAuth, userId, { temporaryPassword: 'Restablecida-2026' }, request);
      const stored = users.rows.get(userId);
      expect(stored).toMatchObject({ passwordHash: 'hash:Restablecida-2026', mustChangePassword: true, failedAttempts: 0, lockedUntil: null });
      expect(stored?.temporaryPasswordExpiresAt).toBeInstanceOf(Date);
      expect(users.passwordChanges).toEqual([{ userId, keepSessionId: null }]);
      expect(audit.entries[0]).toMatchObject({ action: 'CONTRASENA_RESTABLECIDA', recordId: String(userId), roleCode: 'ADMIN_CENTRAL' });
      expect(JSON.stringify(audit.entries)).not.toContain('Restablecida-2026');
      expect(audit.transactional).toBe(1);
    });

    it('no restablece a un usuario inexistente ni la propia contraseña (para eso está cambiarla)', async () => {
      await expect(service.resetPassword(adminAuth, 999, { temporaryPassword: 'Restablecida-2026' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
      users.seed({ ...docenteRecord({ email: 'admin@sirai.test' }), id: adminAuth.userId });
      await expect(service.resetPassword(adminAuth, adminAuth.userId, { temporaryPassword: 'Restablecida-2026' }, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    });
  });
});
