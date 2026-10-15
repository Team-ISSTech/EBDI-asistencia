import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { childListResponseSchema, roomListResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';

const newChild = (roomId: number, overrides: Record<string, unknown> = {}) => ({
  enrollmentNumber: 'M-INT-1',
  name: 'Infante',
  paternalSurname: 'Prueba',
  birthDate: '2025-06-01',
  hasDisability: true,
  disabilityGroup: 'Motriz',
  roomId,
  ...overrides,
});

/** Padrón de infantes contra MySQL real, con guards y permisos de producción. */
describe.skipIf(!TEST_DATABASE_URL)('padrón de infantes (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let roomId = 0;

  const cookieFor = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error(`Sin cookie para ${email}`);
    return cookie.split(';')[0] ?? '';
  };

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
    const [rows] = (await connection.db.execute(sql`SELECT id FROM salas_grupos ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    roomId = rows[0]?.id ?? 0;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('niega el padrón sin sesión', async () => {
    expect((await request(app.getHttpServer()).get('/infantes')).status).toBe(401);
  });

  it('los roles centrales no ven infantes ni salas', async () => {
    for (const email of ['admin_central@sirai.test', 'supervisor_central@sirai.test']) {
      const cookie = await cookieFor(email);
      expect((await request(app.getHttpServer()).get('/infantes').set('Cookie', cookie)).status).toBe(403);
      expect((await request(app.getHttpServer()).get('/salas').set('Cookie', cookie)).status).toBe(403);
    }
  });

  it('la docente consulta pero no da de alta', async () => {
    const cookie = await cookieFor('docente@sirai.test');
    const rooms = await request(app.getHttpServer()).get('/salas').set('Cookie', cookie);
    expect(rooms.status).toBe(200);
    expect(roomListResponseSchema.parse(rooms.body).rooms.length).toBeGreaterThan(0);
    const denied = await request(app.getHttpServer()).post('/infantes').set('Cookie', cookie).send(newChild(roomId));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('SIN_PERMISO');
  });

  it('la directora da de alta y el infante aparece en el padrón', async () => {
    const cookie = await cookieFor('directora@sirai.test');
    const created = await request(app.getHttpServer()).post('/infantes').set('Cookie', cookie).send(newChild(roomId));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ enrollmentNumber: 'M-INT-1', hasDisability: true, status: 'ACTIVO' });
    expect(created.body).not.toHaveProperty('disabilityGroup');
    const list = await request(app.getHttpServer()).get('/infantes').set('Cookie', cookie);
    expect(childListResponseSchema.parse(list.body).children.map((c) => c.enrollmentNumber)).toContain('M-INT-1');
  });

  it('guarda la discapacidad cifrada, la inscripción, el movimiento y la auditoría', async () => {
    const [child] = (await connection.db.execute(
      sql`SELECT HEX(grupo_discapacidad_cifrado) AS hex FROM infantes WHERE matricula = 'M-INT-1'`,
    )) as unknown as [{ hex: string }[]];
    expect(child[0]?.hex).toBeTruthy();
    expect(Buffer.from(child[0]?.hex ?? '', 'hex').toString('utf8')).not.toContain('Motriz');
    const [counts] = (await connection.db.execute(
      sql`SELECT (SELECT COUNT(*) FROM inscripciones) AS inscripciones,
                 (SELECT COUNT(*) FROM movimientos_inscripcion WHERE tipo_movimiento = 'ALTA') AS altas,
                 (SELECT COUNT(*) FROM auditoria WHERE accion = 'INFANTE_REGISTRADO') AS auditadas`,
    )) as unknown as [{ inscripciones: number; altas: number; auditadas: number }[]];
    expect(counts[0]).toEqual({ inscripciones: 1, altas: 1, auditadas: 1 });
  });

  it('rechaza matrícula repetida con CONFLICTO y sin dejar rastro a medias', async () => {
    const cookie = await cookieFor('directora@sirai.test');
    const duplicate = await request(app.getHttpServer()).post('/infantes').set('Cookie', cookie).send(newChild(roomId));
    expect(duplicate.status).toBe(409);
    const [rows] = (await connection.db.execute(sql`SELECT COUNT(*) AS n FROM inscripciones`)) as unknown as [{ n: number }[]];
    expect(rows[0]?.n).toBe(1);
  });

  it('rechaza una sala que no existe', async () => {
    const cookie = await cookieFor('directora@sirai.test');
    const response = await request(app.getHttpServer()).post('/infantes').set('Cookie', cookie).send(newChild(99999, { enrollmentNumber: 'M-INT-2' }));
    expect(response.status).toBe(404);
  });

  it('rechaza cuerpos inválidos con DATOS_INVALIDOS', async () => {
    const cookie = await cookieFor('directora@sirai.test');
    const response = await request(app.getHttpServer()).post('/infantes').set('Cookie', cookie).send({ name: 'x' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DATOS_INVALIDOS');
  });
});
