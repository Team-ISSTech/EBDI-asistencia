import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { estanciaAdminListResponseSchema, roomAdminListResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const ADMIN = 'admin_central@sirai.test';
const DIRECTORA = 'directora@sirai.test';
const MS_PER_DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);

/** Catálogos de estancias y salas contra MySQL real, con sus reglas de integridad y su auditoría. */
describe.skipIf(!TEST_DATABASE_URL)('catálogo de estancias y salas (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;

  const cookieFor = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error(`Sin cookie para ${email}`);
    return cookie.split(';')[0] ?? '';
  };

  /** La cookie se resuelve antes de crear la petición: supertest no admite dos a la vez sobre el mismo servidor. */
  const call = async (method: 'get' | 'post' | 'patch', path: string, email: string, body?: object): Promise<request.Response> => {
    const cookie = await cookieFor(email);
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };

  const count = async (query: ReturnType<typeof sql>): Promise<number> => {
    const [rows] = (await connection.db.execute(query)) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n);
  };

  const estancia = { code: 'ebdi-100', name: 'Estancia Nueva', timeZone: 'America/Tijuana', region: 'Norte' };

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '500';
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    connection = connect(TEST_DATABASE_URL);
    await syncRolePermissions(connection.db);
    await seedDevelopmentData(connection.db, SEED_PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  describe('estancias (RF-31)', () => {
    let id = 0;

    it('solo el administrador central administra estancias', async () => {
      for (const email of [DIRECTORA, 'docente@sirai.test', 'trabajo_social@sirai.test', 'supervisor_central@sirai.test']) {
        expect((await call('get', '/administracion/estancias', email)).status).toBe(403);
        expect((await call('post', '/administracion/estancias', email, estancia)).status).toBe(403);
      }
    });

    it('crea una estancia con la clave en mayúsculas y la lista', async () => {
      const created = await call('post', '/administracion/estancias', ADMIN, estancia);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ code: 'EBDI-100', name: 'Estancia Nueva', timeZone: 'America/Tijuana', region: 'Norte', status: 'ACTIVA' });
      id = created.body.id;
      const list = estanciaAdminListResponseSchema.parse((await call('get', '/administracion/estancias', ADMIN)).body);
      expect(list.estancias.map((row) => row.code)).toContain('EBDI-100');
    });

    it('rechaza clave repetida, zona horaria inexistente y cuerpos inválidos', async () => {
      expect((await call('post', '/administracion/estancias', ADMIN, estancia)).status).toBe(409);
      expect((await call('post', '/administracion/estancias', ADMIN, { ...estancia, code: 'OTRA', timeZone: 'Marte/Olimpo' })).status).toBe(400);
      expect((await call('post', '/administracion/estancias', ADMIN, { code: 'X Y', name: 'x', timeZone: 'UTC' })).status).toBe(400);
      expect((await call('patch', `/administracion/estancias/${id}`, ADMIN, {})).status).toBe(400);
    });

    it('edita datos (menos la clave) y deja el antes y el después en la bitácora', async () => {
      const updated = await call('patch', `/administracion/estancias/${id}`, ADMIN, { name: 'Estancia Renombrada', region: 'Sur', code: 'NO-CAMBIA' });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ code: 'EBDI-100', name: 'Estancia Renombrada', region: 'Sur' });
      expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'ESTANCIA_ACTUALIZADA' AND registro_id = ${String(id)}`)).toBe(1);
    });

    it('una estancia con infantes inscritos no se desactiva ni se da de baja', async () => {
      const [rooms] = (await connection.db.execute(sql`SELECT id FROM salas_grupos ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
      await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-ADM-1', name: 'Infante', paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: rooms[0]?.id });
      const [seeded] = (await connection.db.execute(sql`SELECT id FROM estancias WHERE clave_ebdi = 'EBDI-TEST-01'`)) as unknown as [{ id: number }[]];
      expect((await call('patch', `/administracion/estancias/${seeded[0]?.id}`, ADMIN, { status: 'INACTIVA' })).status).toBe(409);
      expect((await call('post', `/administracion/estancias/${seeded[0]?.id}/baja`, ADMIN)).status).toBe(409);
    });

    it('una estancia con una jornada abierta tampoco se da de baja', async () => {
      await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' });
      await connection.db.execute(sql`UPDATE inscripciones SET estatus = 'BAJA'`);
      const [seeded] = (await connection.db.execute(sql`SELECT id FROM estancias WHERE clave_ebdi = 'EBDI-TEST-01'`)) as unknown as [{ id: number }[]];
      const response = await call('post', `/administracion/estancias/${seeded[0]?.id}/baja`, ADMIN);
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/jornadas/);
    });

    it('desactiva, reactiva y da de baja con borrado lógico una estancia sin uso', async () => {
      expect((await call('patch', `/administracion/estancias/${id}`, ADMIN, { status: 'INACTIVA' })).body.status).toBe('INACTIVA');
      expect((await call('patch', `/administracion/estancias/${id}`, ADMIN, { status: 'ACTIVA' })).body.status).toBe('ACTIVA');
      expect((await call('post', `/administracion/estancias/${id}/baja`, ADMIN)).status).toBe(204);
      expect(await count(sql`SELECT COUNT(*) AS n FROM estancias WHERE id = ${id} AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL`)).toBe(1);
      const list = estanciaAdminListResponseSchema.parse((await call('get', '/administracion/estancias', ADMIN)).body);
      expect(list.estancias.map((row) => row.code)).not.toContain('EBDI-100');
      expect((await call('post', `/administracion/estancias/${id}/baja`, ADMIN)).status).toBe(404);
    });

    it('audita el alta y la baja', async () => {
      expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion IN ('ESTANCIA_CREADA', 'ESTANCIA_DADA_DE_BAJA') AND rol_codigo = 'ADMIN_CENTRAL'`)).toBe(2);
    });
  });

  describe('salas (RF-32)', () => {
    let roomId = 0;
    const room = { name: 'Preescolar A', shift: 'VESPERTINO', minAgeMonths: 36, maxAgeMonths: 72, capacity: 2 };

    it('solo la directora administra salas', async () => {
      for (const email of [ADMIN, 'docente@sirai.test', 'medico@sirai.test', 'trabajo_social@sirai.test']) {
        expect((await call('get', '/administracion/salas', email)).status).toBe(403);
        expect((await call('post', '/administracion/salas', email, room)).status).toBe(403);
      }
    });

    it('crea una sala en su estancia y la lista con sus inscritos', async () => {
      const created = await call('post', '/administracion/salas', DIRECTORA, room);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ name: 'Preescolar A', shift: 'VESPERTINO', capacity: 2, status: 'ACTIVO', enrolled: 0 });
      roomId = created.body.id;
      const list = roomAdminListResponseSchema.parse((await call('get', '/administracion/salas', DIRECTORA)).body);
      expect(list.rooms.map((r) => r.name)).toEqual(expect.arrayContaining(['Preescolar A', 'Lactantes (prueba)']));
    });

    it('rechaza una sala repetida, un turno inventado y un rango de edad invertido', async () => {
      expect((await call('post', '/administracion/salas', DIRECTORA, room)).status).toBe(409);
      expect((await call('post', '/administracion/salas', DIRECTORA, { ...room, name: 'B', shift: 'NOCTURNO' })).status).toBe(400);
      expect((await call('patch', `/administracion/salas/${roomId}`, DIRECTORA, { minAgeMonths: 80 })).status).toBe(400);
    });

    it('la capacidad se respeta: una sala llena no admite más inscripciones (RF-32)', async () => {
      const born = new Date(Date.now() - 4 * 365 * MS_PER_DAY).toISOString().slice(0, 10);
      const enroll = (n: number) => call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-SAL-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: born, roomId });
      expect((await enroll(1)).status).toBe(201);
      expect((await enroll(2)).status).toBe(201);
      const full = await enroll(3);
      expect(full.status).toBe(409);
      expect(full.body.error.message).toMatch(/llena/);
    });

    it('con infantes inscritos no se cambia el turno, no se baja la capacidad de más ni se desactiva', async () => {
      expect((await call('patch', `/administracion/salas/${roomId}`, DIRECTORA, { shift: 'MATUTINO' })).status).toBe(409);
      expect((await call('patch', `/administracion/salas/${roomId}`, DIRECTORA, { capacity: 1 })).status).toBe(409);
      expect((await call('patch', `/administracion/salas/${roomId}`, DIRECTORA, { status: 'INACTIVO' })).status).toBe(409);
      expect((await call('post', `/administracion/salas/${roomId}/baja`, DIRECTORA)).status).toBe(409);
      expect((await call('patch', `/administracion/salas/${roomId}`, DIRECTORA, { capacity: 5, name: 'Preescolar A+' })).body).toMatchObject({ capacity: 5, name: 'Preescolar A+', enrolled: 2 });
    });

    it('una sala vacía se desactiva, se reactiva y se da de baja con borrado lógico', async () => {
      await connection.db.execute(sql`UPDATE inscripciones SET estatus = 'BAJA' WHERE sala_grupo_id = ${roomId}`);
      expect((await call('patch', `/administracion/salas/${roomId}`, DIRECTORA, { status: 'INACTIVO' })).body.status).toBe('INACTIVO');
      expect((await call('patch', `/administracion/salas/${roomId}`, DIRECTORA, { status: 'ACTIVO' })).body.status).toBe('ACTIVO');
      expect((await call('post', `/administracion/salas/${roomId}/baja`, DIRECTORA)).status).toBe(204);
      expect(await count(sql`SELECT COUNT(*) AS n FROM salas_grupos WHERE id = ${roomId} AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL`)).toBe(1);
      expect((await call('post', `/administracion/salas/${roomId}/baja`, DIRECTORA)).status).toBe(404);
    });

    it('un infante no se inscribe en una sala inactiva ni en una dada de baja', async () => {
      const created = await call('post', '/administracion/salas', DIRECTORA, { name: 'Sala temporal', shift: 'MATUTINO', capacity: null });
      await call('patch', `/administracion/salas/${created.body.id}`, DIRECTORA, { status: 'INACTIVO' });
      const born = recentBirthDate;
      expect((await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-SAL-${randomUUID().slice(0, 6)}`, name: 'X', paternalSurname: 'Y', birthDate: born, roomId: created.body.id })).status).toBe(409);
    });

    it('audita altas, cambios y bajas de salas', async () => {
      expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'SALA_CREADA'`)).toBeGreaterThanOrEqual(2);
      expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'SALA_ACTUALIZADA'`)).toBeGreaterThanOrEqual(3);
      expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'SALA_DADA_DE_BAJA'`)).toBe(1);
    });
  });
});
