import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { childGuardianListResponseSchema, guardianPhoneResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const PHONE = '5512345678';

/** Tutores y teléfono cifrado contra MySQL real, con los permisos de producción. */
describe.skipIf(!TEST_DATABASE_URL)('tutores (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let childId = 0;
  let guardianId = 0;

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

  const link = { relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: '2026-10-14' };

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '100';
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
    const child = await call('post', '/infantes', 'directora@sirai.test', {
      enrollmentNumber: 'M-TUT-1',
      name: 'Infante',
      paternalSurname: 'Prueba',
      birthDate: '2025-06-01',
      roomId: rooms[0]?.id,
    });
    childId = child.body.id;
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo la directora registra tutores', async () => {
    const body = { name: 'Tutor', paternalSurname: 'Prueba', phone: PHONE };
    for (const email of ['docente@sirai.test', 'trabajo_social@sirai.test', 'admin_central@sirai.test']) {
      const response = await call('post', '/tutores', email, body);
      expect(response.status).toBe(403);
    }
    const created = await call('post', '/tutores', 'directora@sirai.test', body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Tutor', hasPhone: true });
    expect(JSON.stringify(created.body)).not.toContain(PHONE);
    guardianId = created.body.id;
  });

  it('guarda el teléfono cifrado y su hash con llave', async () => {
    const [rows] = (await connection.db.execute(
      sql`SELECT HEX(telefono_cifrado) AS cipher, LENGTH(telefono_hash) AS hash_len FROM tutores WHERE id = ${guardianId}`,
    )) as unknown as [{ cipher: string; hash_len: number }[]];
    expect(Buffer.from(rows[0]?.cipher ?? '', 'hex').toString('utf8')).not.toContain(PHONE);
    expect(rows[0]?.hash_len).toBe(32);
  });

  it('vincula el tutor al infante y rechaza un segundo principal', async () => {
    const linked = await call('post', `/infantes/${childId}/tutores`, 'directora@sirai.test', { guardianId, ...link });
    expect(linked.status).toBe(201);
    expect(linked.body).toMatchObject({ relationship: 'Madre', isPrimary: true, isEmergencyContact: true });
    const second = await call('post', '/tutores', 'directora@sirai.test', { name: 'Otro', paternalSurname: 'Prueba', phone: '5598765432' });
    const duplicatePrimary = await call('post', `/infantes/${childId}/tutores`, 'directora@sirai.test', { guardianId: second.body.id, ...link });
    expect(duplicatePrimary.status).toBe(409);
    const again = await call('post', `/infantes/${childId}/tutores`, 'directora@sirai.test', { guardianId, ...link, isPrimary: false });
    expect(again.status).toBe(409);
  });

  it('la docente ve los tutores del infante, sin teléfono', async () => {
    const response = await call('get', `/infantes/${childId}/tutores`, 'docente@sirai.test');
    expect(response.status).toBe(200);
    expect(childGuardianListResponseSchema.parse(response.body).guardians).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain(PHONE);
  });

  it('el teléfono completo solo lo ve quien accede a notas familiares, y queda auditado', async () => {
    const path = `/tutores/${guardianId}/telefono`;
    expect((await call('get', path, 'docente@sirai.test')).status).toBe(403);
    expect((await call('get', path, 'admin_central@sirai.test')).status).toBe(403);
    const allowed = await call('get', path, 'trabajo_social@sirai.test');
    expect(allowed.status).toBe(200);
    expect(guardianPhoneResponseSchema.parse(allowed.body)).toEqual({ phone: PHONE });
    const [rows] = (await connection.db.execute(
      sql`SELECT rol_codigo AS role, registro_id AS record FROM auditoria WHERE accion = 'TELEFONO_CONSULTADO'`,
    )) as unknown as [{ role: string; record: string }[]];
    expect(rows).toEqual([{ role: 'TRABAJO_SOCIAL', record: String(guardianId) }]);
  });

  it('un tutor sin vínculo en la estancia no revela su teléfono', async () => {
    const orphan = await call('post', '/tutores', 'directora@sirai.test', { name: 'Sin vínculo', paternalSurname: 'Prueba', phone: '5511112222' });
    const response = await call('get', `/tutores/${orphan.body.id}/telefono`, 'directora@sirai.test');
    expect(response.status).toBe(404);
  });

  it('rechaza teléfonos mal formados', async () => {
    const response = await call('post', '/tutores', 'directora@sirai.test', { name: 'X', paternalSurname: 'Y', phone: '123' });
    expect(response.status).toBe(400);
  });
});
