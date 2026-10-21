import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authorizedPickupsResponseSchema, incidentListResponseSchema, registerDepartureResponseSchema, rosterResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { type SQL, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';
const DOCENTE = 'docente@sirai.test';
const TRABAJO_SOCIAL = 'trabajo_social@sirai.test';
const MS_PER_DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
const lastMonth = new Date(Date.now() - 30 * MS_PER_DAY).toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);
const DESCRIPTION = 'Se golpeó la rodilla en el patio; se aplicó hielo.';

/** Salida e incidencias (S-27) contra MySQL real, con los permisos y la auditoría de producción. */
describe.skipIf(!TEST_DATABASE_URL)('salida e incidencias (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let journeyId = 0;
  /** Inscripciones: [0] presente, [1] con falta, [2] sin marcar. */
  let enrollmentIds: number[] = [];
  const guardianIds: Record<'authorized' | 'notAuthorized' | 'expired', number> = { authorized: 0, notAuthorized: 0, expired: 0 };

  const cookieFor = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error(`Sin cookie para ${email}`);
    return cookie.split(';')[0] ?? '';
  };

  const call = async (method: 'get' | 'post', path: string, email: string, body?: object): Promise<request.Response> => {
    const cookie = await cookieFor(email);
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };

  const rows = async <T>(query: SQL): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];
  const record = (index: number) => `/asistencia/jornadas/${journeyId}/registros/${enrollmentIds[index]}`;

  const createGuardian = async (childId: number, name: string, link: { canPickUp: boolean; validFrom: string; validUntil: string | null }): Promise<number> => {
    const created = await call('post', '/tutores', DIRECTORA, { name, paternalSurname: 'Prueba', phone: '5550000000' });
    const guardianId = (created.body as { id: number }).id;
    const linked = await call('post', `/infantes/${childId}/tutores`, DIRECTORA, { guardianId, relationship: 'Madre', ...link });
    expect(linked.status, JSON.stringify(linked.body)).toBe(201);
    return guardianId;
  };

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
    const [room] = await rows<{ id: number }>(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`);
    for (const n of [1, 2, 3]) {
      await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-SAL-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: room?.id });
    }
    const enrollments = await rows<{ id: number; childId: number }>(sql`SELECT id, infante_id AS childId FROM inscripciones ORDER BY id`);
    enrollmentIds = enrollments.map((row) => row.id);
    const childId = enrollments[0]?.childId ?? 0;
    guardianIds.authorized = await createGuardian(childId, 'Autorizada', { canPickUp: true, validFrom: lastMonth, validUntil: null });
    guardianIds.notAuthorized = await createGuardian(childId, 'SinPermiso', { canPickUp: false, validFrom: lastMonth, validUntil: null });
    guardianIds.expired = await createGuardian(childId, 'Vencida', { canPickUp: true, validFrom: lastMonth, validUntil: null });
    // Pasa el tiempo: la vigencia de este vínculo terminó ayer.
    await connection.db.execute(sql`UPDATE infante_tutor SET vigencia_hasta = ${yesterday} WHERE tutor_id = ${guardianIds.expired}`);
    journeyId = (await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' })).body.id;
    const marks = [
      { enrollmentId: enrollmentIds[0], status: 'PRESENTE', clientId: randomUUID() },
      { enrollmentId: enrollmentIds[1], status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() },
    ];
    expect((await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, { marks })).status).toBe(200);
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo ofrece a quien está vinculado, vigente y autorizado a recoger, sin teléfono', async () => {
    const response = await call('get', `${record(0)}/autorizados`, DOCENTE);
    expect(response.status).toBe(200);
    const { guardians } = authorizedPickupsResponseSchema.parse(response.body);
    expect(guardians).toEqual([{ id: guardianIds.authorized, name: 'Autorizada Prueba', relationship: 'Madre' }]);
    expect(JSON.stringify(response.body)).not.toContain('555');
  });

  it('rechaza la salida con alguien sin autorización o con la vigencia vencida', async () => {
    for (const guardianId of [guardianIds.notAuthorized, guardianIds.expired]) {
      const response = await call('post', `${record(0)}/salida`, DOCENTE, { guardianId });
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/no está autorizada/);
    }
  });

  it('no registra la salida de quien no ingresó', async () => {
    for (const index of [1, 2]) {
      const response = await call('post', `${record(index)}/salida`, DOCENTE, { guardianId: guardianIds.authorized });
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/no tiene ingreso/);
    }
  });

  it('registra la salida con el tutor autorizado, una sola vez, y la lista la muestra', async () => {
    const response = await call('post', `${record(0)}/salida`, DOCENTE, { guardianId: guardianIds.authorized });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const { leftAt } = registerDepartureResponseSchema.parse(response.body);
    const [stored] = await rows<{ picked: number; by: number }>(sql`SELECT recogido_por AS picked, salida_registrada_por AS \`by\` FROM asistencias WHERE inscripcion_id = ${enrollmentIds[0]}`);
    expect(stored?.picked).toBe(guardianIds.authorized);
    expect((await call('post', `${record(0)}/salida`, DOCENTE, { guardianId: guardianIds.authorized })).status).toBe(409);
    const { entries } = rosterResponseSchema.parse((await call('get', `/asistencia/jornadas/${journeyId}/lista`, DOCENTE)).body);
    expect(entries.find((entry) => entry.enrollmentId === enrollmentIds[0])?.leftAt).toBe(leftAt);
    expect(entries.find((entry) => entry.enrollmentId === enrollmentIds[1])?.leftAt).toBeNull();
    const [audit] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'SALIDA_REGISTRADA'`);
    expect(Number(audit?.n)).toBe(1);
  });

  it('tras la salida, la asistencia del día ya no cambia de estado', async () => {
    const marks = [{ enrollmentId: enrollmentIds[0], status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() }];
    const response = await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, { marks });
    expect(response.status).toBe(409);
    const [stored] = await rows<{ status: string }>(sql`SELECT estado AS status FROM asistencias WHERE inscripcion_id = ${enrollmentIds[0]}`);
    expect(stored?.status).toBe('PRESENTE');
  });

  it('registra una incidencia cifrada; la docente ve el tipo y solo quien lee notas sensibles ve la descripción', async () => {
    const created = await call('post', `${record(0)}/incidencias`, DOCENTE, { type: 'ACCIDENTE', description: DESCRIPTION });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const [stored] = await rows<{ cipher: Buffer }>(sql`SELECT descripcion_cifrada AS cipher FROM incidencias_asistencia`);
    expect(stored?.cipher.toString('utf8')).not.toContain('rodilla');

    const forTeacher = incidentListResponseSchema.parse((await call('get', `${record(0)}/incidencias`, DOCENTE)).body);
    expect(forTeacher.incidents).toEqual([expect.objectContaining({ type: 'ACCIDENTE', description: null })]);
    expect((await call('get', `${record(0)}/incidencias/detalle`, DOCENTE)).status).toBe(403);

    const detail = incidentListResponseSchema.parse((await call('get', `${record(0)}/incidencias/detalle`, TRABAJO_SOCIAL)).body);
    expect(detail.incidents[0]?.description).toBe(DESCRIPTION);
    const [audit] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'INCIDENCIAS_CONSULTADAS'`);
    expect(Number(audit?.n)).toBe(1);
    const { entries } = rosterResponseSchema.parse((await call('get', `/asistencia/jornadas/${journeyId}/lista`, DOCENTE)).body);
    expect(entries.find((entry) => entry.enrollmentId === enrollmentIds[0])?.incidentCount).toBe(1);
  });

  it('rechaza incidencias de quien no ingresó, de un tipo fuera del catálogo o de un infante de otra estancia', async () => {
    expect((await call('post', `${record(1)}/incidencias`, DOCENTE, { type: 'ENFERMEDAD', description: 'Fiebre.' })).status).toBe(409);
    expect((await call('post', `${record(0)}/incidencias`, DOCENTE, { type: 'PELEA', description: 'x' })).status).toBe(400);
    expect((await call('post', `/asistencia/jornadas/${journeyId}/registros/999999/incidencias`, DOCENTE, { type: 'OTRA', description: 'x' })).status).toBe(404);
  });

  it('el motor exige hora, tutor y quién registró juntos, y solo los tipos del catálogo', async () => {
    const reject = (query: SQL) => expect(connection.db.execute(query)).rejects.toThrow();
    await reject(sql`UPDATE asistencias SET hora_salida = NOW(6) WHERE inscripcion_id = ${enrollmentIds[1]}`);
    await reject(sql`UPDATE asistencias SET recogido_por = NULL WHERE inscripcion_id = ${enrollmentIds[0]}`);
    const [present] = await rows<{ id: number }>(sql`SELECT id FROM asistencias WHERE inscripcion_id = ${enrollmentIds[0]}`);
    await reject(sql`INSERT INTO incidencias_asistencia (asistencia_id, tipo, registrada_por) VALUES (${present?.id}, 'PELEA', 1)`);
  });

  it('con la jornada cerrada ya no se registran salidas ni incidencias', async () => {
    expect((await call('post', `/asistencia/jornadas/${journeyId}/cierre`, DIRECTORA)).status).toBeLessThan(300);
    expect((await call('post', `${record(0)}/incidencias`, DOCENTE, { type: 'OTRA', description: 'x' })).status).toBe(409);
  });
});
