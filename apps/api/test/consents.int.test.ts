import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { consentListResponseSchema, consentSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';

/** Consentimiento del tutor contra MySQL real, con los permisos de producción. */
describe.skipIf(!TEST_DATABASE_URL)('consentimientos (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let childId = 0;
  let guardianId = 0;
  let consentId = 0;

  const cookieFor = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error(`Sin cookie para ${email}`);
    return cookie.split(';')[0] ?? '';
  };

  /** La cookie se resuelve antes de crear la petición: supertest no admite dos a la vez sobre el mismo servidor. */
  const call = async (method: 'get' | 'post', path: string, email: string, body?: object): Promise<request.Response> => {
    const cookie = await cookieFor(email);
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };

  const phoneConsent = { type: 'CONTACTO_TELEFONICO', noticeVersion: 'AP-2026-1' };

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '200';
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    connection = connect(TEST_DATABASE_URL);
    await syncRolePermissions(connection.db);
    await seedDevelopmentData(connection.db, SEED_PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const [rooms] = (await connection.db.execute(sql`SELECT id FROM salas_grupos ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    const child = await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-CON-1', name: 'Infante', paternalSurname: 'Prueba', birthDate: '2025-06-01', roomId: rooms[0]?.id });
    childId = child.body.id;
    const guardian = await call('post', '/tutores', DIRECTORA, { name: 'Tutora', paternalSurname: 'Prueba', phone: '5512345678' });
    guardianId = guardian.body.id;
    await call('post', `/infantes/${childId}/tutores`, DIRECTORA, { guardianId, relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: '2026-10-14' });
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo la directora registra consentimientos', async () => {
    const path = `/infantes/${childId}/consentimientos`;
    for (const email of ['docente@sirai.test', 'trabajo_social@sirai.test', 'medico@sirai.test', 'admin_central@sirai.test']) {
      expect((await call('post', path, email, { guardianId, ...phoneConsent })).status).toBe(403);
    }
    const created = await call('post', path, DIRECTORA, { guardianId, ...phoneConsent });
    expect(created.status).toBe(201);
    expect(consentSchema.parse(created.body)).toMatchObject({ accepted: true, revokedAt: null, noticeVersion: 'AP-2026-1' });
    consentId = created.body.id;
  });

  it('rechaza una segunda aceptación vigente y a tutores sin vínculo', async () => {
    const path = `/infantes/${childId}/consentimientos`;
    expect((await call('post', path, DIRECTORA, { guardianId, ...phoneConsent })).status).toBe(409);
    const stranger = await call('post', '/tutores', DIRECTORA, { name: 'Ajeno', paternalSurname: 'Prueba', phone: '5599998888' });
    expect((await call('post', path, DIRECTORA, { guardianId: stranger.body.id, ...phoneConsent })).status).toBe(400);
  });

  it('la docente ve el historial', async () => {
    const response = await call('get', `/infantes/${childId}/consentimientos`, 'docente@sirai.test');
    expect(response.status).toBe(200);
    expect(consentListResponseSchema.parse(response.body).consents).toHaveLength(1);
  });

  it('revoca sin borrar la fila y deja la auditoría', async () => {
    expect((await call('post', `/consentimientos/${consentId}/revocar`, 'docente@sirai.test')).status).toBe(403);
    const revoked = await call('post', `/consentimientos/${consentId}/revocar`, DIRECTORA);
    expect(revoked.status).toBe(200);
    expect(revoked.body.revokedAt).not.toBeNull();
    const [rows] = (await connection.db.execute(
      sql`SELECT (SELECT COUNT(*) FROM consentimientos) AS filas,
                 (SELECT COUNT(*) FROM auditoria WHERE accion = 'CONSENTIMIENTO_REGISTRADO') AS registradas,
                 (SELECT COUNT(*) FROM auditoria WHERE accion = 'CONSENTIMIENTO_REVOCADO') AS revocadas`,
    )) as unknown as [{ filas: number; registradas: number; revocadas: number }[]];
    expect(rows[0]).toEqual({ filas: 1, registradas: 1, revocadas: 1 });
    expect((await call('post', `/consentimientos/${consentId}/revocar`, DIRECTORA)).status).toBe(409);
  });

  it('permite volver a aceptar tras revocar y conserva el historial', async () => {
    const again = await call('post', `/infantes/${childId}/consentimientos`, DIRECTORA, { guardianId, ...phoneConsent });
    expect(again.status).toBe(201);
    const list = await call('get', `/infantes/${childId}/consentimientos`, DIRECTORA);
    expect(consentListResponseSchema.parse(list.body).consents).toHaveLength(2);
  });

  it('el motor rechaza revocar un rechazo y tipos desconocidos', async () => {
    const refused = await call('post', `/infantes/${childId}/consentimientos`, DIRECTORA, { guardianId, type: 'TRATAMIENTO_DATOS_SENSIBLES', noticeVersion: 'AP-2026-1', accepted: false });
    await expect(connection.db.execute(sql`UPDATE consentimientos SET revocado_at = NOW(6) WHERE id = ${refused.body.id}`)).rejects.toThrow();
    await expect(
      connection.db.execute(
        sql`INSERT INTO consentimientos (infante_id, tutor_id, tipo, version_aviso, aceptado, aceptado_at, registrado_por) VALUES (${childId}, ${guardianId}, 'OTRO', 'v1', 1, NOW(6), 1)`,
      ),
    ).rejects.toThrow();
  });

  it('rechaza cuerpos inválidos y consentimientos inexistentes', async () => {
    expect((await call('post', `/infantes/${childId}/consentimientos`, DIRECTORA, { guardianId, type: 'OTRO', noticeVersion: 'v1' })).status).toBe(400);
    expect((await call('post', '/consentimientos/99999/revocar', DIRECTORA)).status).toBe(404);
  });
});
