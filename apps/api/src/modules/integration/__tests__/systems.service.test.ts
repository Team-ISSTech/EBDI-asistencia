import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { FakeHasher, RecordingAudit, request, testEnv } from '../../identity/__tests__/in-memory';
import { SystemRateLimiter } from '../services/system-rate-limiter';
import { SystemTokenService } from '../services/system-token.service';
import { SystemsAdminService } from '../services/systems-admin.service';
import { TokenSigner } from '../services/token-signer';
import { InMemorySystems } from './in-memory';

const NOW = new Date('2026-10-18T12:00:00Z');
const admin: AuthContext = {
  sessionId: 1,
  userId: 100,
  principal: { userId: 100, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] },
  activeEstanciaId: null,
};

describe('administración de sistemas externos (RF-37)', () => {
  let systems: InMemorySystems;
  let audit: RecordingAudit;
  let service: SystemsAdminService;

  beforeEach(() => {
    systems = new InMemorySystems();
    audit = new RecordingAudit();
    service = new SystemsAdminService(systems, new FakeHasher(), audit.asService());
  });

  it('registra un sistema: clientId de 32 hex, secreto largo y aleatorio entregado una sola vez, y solo su hash guardado', async () => {
    const created = await service.create(admin, { name: 'Tablero institucional', scopes: ['REPORTE_AGREGADO_LEER'] }, request);
    expect(created.system).toMatchObject({ name: 'Tablero institucional', scopes: ['REPORTE_AGREGADO_LEER'], status: 'ACTIVO', lastUsedAt: null, revokedAt: null });
    expect(created.system.clientId).toMatch(/^[0-9a-f]{32}$/);
    expect(created.clientSecret.length).toBeGreaterThanOrEqual(40);
    const stored = systems.rows.get(created.system.id);
    expect(stored?.secretHash).toBe(`hash:${created.clientSecret}`);
    expect(JSON.stringify(created.system)).not.toContain(created.clientSecret);
  });

  it('cada sistema recibe credenciales distintas', async () => {
    const [a, b] = [await service.create(admin, { name: 'A', scopes: ['REPORTE_AGREGADO_LEER'] }, request), await service.create(admin, { name: 'B', scopes: ['REPORTE_AGREGADO_LEER'] }, request)];
    expect(a.system.clientId).not.toBe(b.system.clientId);
    expect(a.clientSecret).not.toBe(b.clientSecret);
  });

  it('audita el alta con lo que se concedió, sin el secreto, en la misma transacción', async () => {
    const created = await service.create(admin, { name: 'Tablero', scopes: ['REPORTE_AGREGADO_LEER'] }, request);
    expect(audit.entries[0]).toMatchObject({ action: 'SISTEMA_REGISTRADO', userId: 100, roleCode: 'ADMIN_CENTRAL', recordId: String(created.system.id), after: { name: 'Tablero', scopes: ['REPORTE_AGREGADO_LEER'] } });
    expect(JSON.stringify(audit.entries)).not.toContain(created.clientSecret);
    expect(audit.transactional).toBe(1);
  });

  it('la lista nunca trae el secreto ni su hash', async () => {
    await service.create(admin, { name: 'Tablero', scopes: ['REPORTE_AGREGADO_LEER'] }, request);
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/secret|hash/i);
  });

  it('revoca sin borrar, con quién lo hizo, y lo audita; revocar dos veces o uno inexistente falla', async () => {
    const { system } = await service.create(admin, { name: 'Tablero', scopes: ['REPORTE_AGREGADO_LEER'] }, request);
    audit.entries.length = 0;
    await service.revoke(admin, system.id, request);
    expect(systems.rows.get(system.id)).toMatchObject({ status: 'REVOCADO' });
    expect(systems.revokedBy).toEqual([{ id: system.id, userId: 100 }]);
    expect(audit.entries[0]).toMatchObject({ action: 'SISTEMA_REVOCADO', recordId: String(system.id) });
    await expect(service.revoke(admin, system.id, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    await expect(service.revoke(admin, 999, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});

describe('tokens de sistemas externos (RF-37)', () => {
  let systems: InMemorySystems;
  let audit: RecordingAudit;
  let admin$: SystemsAdminService;
  let tokens: SystemTokenService;
  let signer: TokenSigner;
  let creds: { clientId: string; clientSecret: string; id: number };
  let now = NOW;

  const make = (rateLimit = 60) => {
    const env = { ...testEnv, API_TOKEN_SECRET: 's'.repeat(40), INTEGRATION_RATE_LIMIT_PER_MINUTE: rateLimit };
    signer = new TokenSigner(env);
    tokens = new SystemTokenService(env, systems, new FakeHasher(), signer, new SystemRateLimiter(), audit.asService(), () => now);
  };

  beforeEach(async () => {
    now = NOW;
    systems = new InMemorySystems();
    audit = new RecordingAudit();
    admin$ = new SystemsAdminService(systems, new FakeHasher(), audit.asService());
    const created = await admin$.create(admin, { name: 'Tablero', scopes: ['REPORTE_AGREGADO_LEER'] }, request);
    creds = { clientId: created.system.clientId, clientSecret: created.clientSecret, id: created.system.id };
    audit.entries.length = 0;
    make();
  });

  describe('emisión', () => {
    it('con las credenciales correctas entrega un token Bearer con sus alcances y vida', async () => {
      const response = await tokens.issue({ clientId: creds.clientId, clientSecret: creds.clientSecret }, request);
      expect(response).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, scope: 'REPORTE_AGREGADO_LEER' });
      expect(await signer.verify(response.accessToken, now)).toEqual({ systemId: creds.id, scopes: ['REPORTE_AGREGADO_LEER'] });
      expect(systems.rows.get(creds.id)?.lastUsedAt).toEqual(NOW);
    });

    it('audita la emisión a nombre del sistema (no de una persona) sin guardar el secreto ni el token', async () => {
      const response = await tokens.issue({ clientId: creds.clientId, clientSecret: creds.clientSecret }, request);
      expect(audit.entries[0]).toMatchObject({ action: 'SISTEMA_TOKEN_EMITIDO', systemId: creds.id, userId: null, tableName: 'sistemas_integracion' });
      expect(JSON.stringify(audit.entries)).not.toContain(response.accessToken);
      expect(JSON.stringify(audit.entries)).not.toContain(creds.clientSecret);
    });

    it('rechaza un secreto incorrecto, un clientId desconocido y un sistema revocado con el mismo mensaje, sin revelar cuál fue', async () => {
      const messages = new Set<string>();
      for (const input of [{ clientId: creds.clientId, clientSecret: 'incorrecto' }, { clientId: 'a'.repeat(32), clientSecret: creds.clientSecret }]) {
        const error = await tokens.issue(input, request).catch((e: { code: string; message: string }) => e);
        expect(error).toMatchObject({ code: 'CREDENCIALES_INVALIDAS' });
        messages.add((error as { message: string }).message);
      }
      await admin$.revoke(admin, creds.id, request);
      const revoked = await tokens.issue({ clientId: creds.clientId, clientSecret: creds.clientSecret }, request).catch((e: { code: string; message: string }) => e);
      expect(revoked).toMatchObject({ code: 'CREDENCIALES_INVALIDAS' });
      messages.add((revoked as { message: string }).message);
      expect(messages.size).toBe(1);
    });

    it('audita el intento fallido de un sistema conocido, y no emite nada', async () => {
      await tokens.issue({ clientId: creds.clientId, clientSecret: 'incorrecto' }, request).catch(() => undefined);
      expect(audit.entries[0]).toMatchObject({ action: 'SISTEMA_TOKEN_FALLIDO', systemId: creds.id });
      expect(systems.rows.get(creds.id)?.lastUsedAt).toBeNull();
    });
  });

  describe('resolución de un token en cada petición', () => {
    const issue = async () => (await tokens.issue({ clientId: creds.clientId, clientSecret: creds.clientSecret }, request)).accessToken;

    it('un token vigente resuelve al sistema con su nombre y alcances', async () => {
      expect(await tokens.resolve(await issue())).toEqual({ systemId: creds.id, name: 'Tablero', scopes: ['REPORTE_AGREGADO_LEER'] });
    });

    it('si se revoca el sistema, el token deja de servir al instante aunque no haya vencido', async () => {
      const token = await issue();
      await admin$.revoke(admin, creds.id, request);
      expect(await tokens.resolve(token)).toBeNull();
    });

    it('si se recortan los alcances del sistema, el token solo conserva los que aún tiene', async () => {
      const token = await issue();
      const row = systems.rows.get(creds.id);
      if (row) systems.rows.set(creds.id, { ...row, scopes: [] });
      expect(await tokens.resolve(token)).toMatchObject({ scopes: [] });
    });

    it('un token vencido, inválido o de un sistema que no existe no resuelve', async () => {
      const token = await issue();
      now = new Date(NOW.getTime() + 16 * 60_000);
      expect(await tokens.resolve(token)).toBeNull();
      expect(await tokens.resolve('no-es-un-token')).toBeNull();
      now = NOW;
      const orphan = (await signer.sign({ systemId: 999, scopes: ['REPORTE_AGREGADO_LEER'] }, NOW)).token;
      expect(await tokens.resolve(orphan)).toBeNull();
    });

    it('limita las peticiones por minuto de cada sistema con 429, y la cuenta se reinicia en el minuto siguiente', async () => {
      make(2);
      const token = await issue();
      expect(await tokens.resolve(token)).not.toBeNull();
      expect(await tokens.resolve(token)).not.toBeNull();
      await expect(tokens.resolve(token)).rejects.toMatchObject({ code: 'DEMASIADAS_SOLICITUDES' });
      now = new Date(NOW.getTime() + 61_000);
      expect(await tokens.resolve(token)).not.toBeNull();
    });

    it('el límite de un sistema no afecta a otro', async () => {
      make(1);
      const other = await admin$.create(admin, { name: 'Otro', scopes: ['REPORTE_AGREGADO_LEER'] }, request);
      const a = await issue();
      const b = (await tokens.issue({ clientId: other.system.clientId, clientSecret: other.clientSecret }, request)).accessToken;
      expect(await tokens.resolve(a)).not.toBeNull();
      await expect(tokens.resolve(a)).rejects.toMatchObject({ code: 'DEMASIADAS_SOLICITUDES' });
      expect(await tokens.resolve(b)).not.toBeNull();
    });

    it('actualiza el último uso, pero no en cada petición', async () => {
      const token = await issue();
      now = new Date(NOW.getTime() + 10_000);
      await tokens.resolve(token);
      expect(systems.rows.get(creds.id)?.lastUsedAt).toEqual(NOW);
      now = new Date(NOW.getTime() + 61_000);
      const fresh = await issue();
      await tokens.resolve(fresh);
      expect(systems.rows.get(creds.id)?.lastUsedAt).toEqual(now);
    });
  });
});
