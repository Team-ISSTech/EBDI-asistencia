import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { markAttendanceResponseSchema, rosterResponseSchema } from '@sirai/contracts';
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
const DOCENTE = 'docente@sirai.test';
const MS_PER_DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);

/** Pase de lista contra MySQL real, con los permisos y la auditoría de producción. */
describe.skipIf(!TEST_DATABASE_URL)('pase de lista (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let journeyId = 0;
  let enrollmentIds: number[] = [];

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

  const marks = (...entries: Array<[number, string]>) => ({
    marks: entries.map(([enrollmentId, status]) => ({ enrollmentId, status, clientId: randomUUID() })),
  });

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
    const [rooms] = (await connection.db.execute(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    for (const n of [1, 2, 3]) {
      await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-ASI-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: rooms[0]?.id });
    }
    const [rows] = (await connection.db.execute(sql`SELECT id FROM inscripciones ORDER BY id`)) as unknown as [{ id: number }[]];
    enrollmentIds = rows.map((row) => row.id);
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' });
    journeyId = journey.body.id;
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('la docente consulta la lista del turno, sin estados todavía', async () => {
    const response = await call('get', `/asistencia/jornadas/${journeyId}/lista`, DOCENTE);
    expect(response.status).toBe(200);
    const { entries } = rosterResponseSchema.parse(response.body);
    expect(entries.map((entry) => entry.childName)).toEqual(['Infante1 Prueba', 'Infante2 Prueba', 'Infante3 Prueba']);
    expect(entries.every((entry) => entry.status === null)).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/curp|telefono|discapacidad/i);
  });

  it('solo quien registra asistencia puede marcar; los roles centrales no ven la lista', async () => {
    const body = marks([enrollmentIds[0] ?? 0, 'PRESENTE']);
    for (const email of ['trabajo_social@sirai.test', 'medico@sirai.test', 'admin_central@sirai.test']) {
      expect((await call('post', `/asistencia/jornadas/${journeyId}/registros`, email, body)).status).toBe(403);
    }
    for (const email of ['admin_central@sirai.test', 'supervisor_central@sirai.test']) {
      expect((await call('get', `/asistencia/jornadas/${journeyId}/lista`, email)).status).toBe(403);
    }
  });

  it('la docente marca el grupo completo en una sola petición', async () => {
    const [a, b, c] = enrollmentIds;
    const response = await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, marks([a ?? 0, 'PRESENTE'], [b ?? 0, 'PRESENTE'], [c ?? 0, 'FILTRO_SANITARIO']));
    expect(response.status).toBe(200);
    expect(markAttendanceResponseSchema.parse(response.body)).toEqual({ saved: 3, unchanged: 0 });
    const list = await call('get', `/asistencia/jornadas/${journeyId}/lista`, DOCENTE);
    expect(rosterResponseSchema.parse(list.body).entries.map((e) => e.status)).toEqual(['PRESENTE', 'PRESENTE', 'FILTRO_SANITARIO']);
  });

  it('un reintento con las mismas operaciones no duplica nada', async () => {
    const [a] = enrollmentIds;
    const body = marks([a ?? 0, 'PRESENTE']);
    await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, body);
    const replay = await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, body);
    expect(markAttendanceResponseSchema.parse(replay.body)).toEqual({ saved: 0, unchanged: 1 });
    const [rows] = (await connection.db.execute(sql`SELECT COUNT(*) AS n FROM asistencias`)) as unknown as [{ n: number }[]];
    expect(rows[0]?.n).toBe(3);
  });

  it('cambiar un estado se audita con el antes y el después, y guarda la hora de entrada solo de los presentes', async () => {
    const [, b] = enrollmentIds;
    const changed = await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, marks([b ?? 0, 'FALTA_INJUSTIFICADA']));
    expect(markAttendanceResponseSchema.parse(changed.body)).toEqual({ saved: 1, unchanged: 0 });
    const [rows] = (await connection.db.execute(
      sql`SELECT (SELECT COUNT(*) FROM auditoria WHERE accion = 'ASISTENCIA_REGISTRADA') AS registradas,
                 (SELECT COUNT(*) FROM auditoria WHERE accion = 'ASISTENCIA_MODIFICADA') AS modificadas,
                 (SELECT COUNT(*) FROM asistencias WHERE estado = 'PRESENTE' AND hora_entrada IS NOT NULL) AS presentes_con_hora,
                 (SELECT COUNT(*) FROM asistencias WHERE estado <> 'PRESENTE' AND hora_entrada IS NOT NULL) AS otros_con_hora`,
    )) as unknown as [{ registradas: number; modificadas: number; presentes_con_hora: number; otros_con_hora: number }[]];
    expect(rows[0]).toEqual({ registradas: 3, modificadas: 1, presentes_con_hora: 1, otros_con_hora: 0 });
  });

  it('rechaza el lote completo si trae un infante que no es de la estancia', async () => {
    const [a] = enrollmentIds;
    const before = (await connection.db.execute(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion LIKE 'ASISTENCIA%'`)) as unknown as [{ n: number }[]];
    const response = await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, marks([a ?? 0, 'AUSENTE_JUSTIFICADO'], [99999, 'PRESENTE']));
    expect(response.status).toBe(400);
    const after = (await connection.db.execute(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion LIKE 'ASISTENCIA%'`)) as unknown as [{ n: number }[]];
    expect(after[0][0]?.n).toBe(before[0][0]?.n);
    const [rows] = (await connection.db.execute(sql`SELECT estado FROM asistencias WHERE inscripcion_id = ${a}`)) as unknown as [{ estado: string }[]];
    expect(rows[0]?.estado).toBe('PRESENTE');
  });

  it('rechaza cuerpos inválidos y jornadas inexistentes', async () => {
    const [a] = enrollmentIds;
    expect((await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, { marks: [] })).status).toBe(400);
    expect((await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, { marks: [{ enrollmentId: a, status: 'DORMIDO', clientId: randomUUID() }] })).status).toBe(400);
    expect((await call('post', '/asistencia/jornadas/99999/registros', DOCENTE, marks([a ?? 0, 'PRESENTE']))).status).toBe(404);
  });

  it('una jornada de otro turno no admite a los infantes de salas matutinas', async () => {
    const evening = await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'VESPERTINO' });
    const [a] = enrollmentIds;
    const response = await call('post', `/asistencia/jornadas/${evening.body.id}/registros`, DOCENTE, marks([a ?? 0, 'PRESENTE']));
    expect(response.status).toBe(400);
    const list = await call('get', `/asistencia/jornadas/${evening.body.id}/lista`, DOCENTE);
    expect(rosterResponseSchema.parse(list.body).entries).toEqual([]);
  });

  it('no se registra en una jornada cerrada', async () => {
    const [a] = enrollmentIds;
    expect((await call('post', `/asistencia/jornadas/${journeyId}/cierre`, DIRECTORA)).status).toBe(201);
    const response = await call('post', `/asistencia/jornadas/${journeyId}/registros`, DOCENTE, marks([a ?? 0, 'FALTA_INJUSTIFICADA']));
    expect(response.status).toBe(409);
  });

  it('el motor rechaza estados y métodos fuera del catálogo', async () => {
    const [a] = enrollmentIds;
    await expect(
      connection.db.execute(
        sql`INSERT INTO asistencias (jornada_id, inscripcion_id, estado, metodo_registro, uuid_cliente, registrado_por) VALUES (${journeyId}, ${a}, 'DORMIDO', 'MANUAL', ${randomUUID()}, 1)`,
      ),
    ).rejects.toThrow();
  });
});
