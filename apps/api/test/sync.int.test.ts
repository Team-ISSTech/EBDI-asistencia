import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { syncResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FollowUpsGeneratorService } from '../src/modules/follow-ups/services/follow-ups-generator.service';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';
const DOCENTE = 'docente@sirai.test';
const SOCIAL_WORK = 'trabajo_social@sirai.test';
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);
const hoursAgo = (hours: number): string => new Date(Date.now() - hours * MS_PER_HOUR).toISOString();

/** Sincronización de lo capturado sin conexión: acuses, reintentos y reglas de conflicto contra MySQL real. */
describe.skipIf(!TEST_DATABASE_URL)('sincronización sin conexión (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let journeyId = 0;
  let enrollmentIds: number[] = [];
  let ticketId = 0;

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

  const sync = async (email: string, ...operations: object[]) => {
    const response = await call('post', '/sincronizacion', email, { operations });
    return { status: response.status, results: response.status === 200 ? syncResponseSchema.parse(response.body).results : [], body: response.body };
  };

  const marks = (n: number, enrollmentId: number, status: string, capturedAt = hoursAgo(3), operationId = randomUUID()) => ({
    operationId,
    type: 'ATTENDANCE_MARKS',
    capturedAt,
    payload: { journeyId, marks: [{ enrollmentId, status, clientId: randomUUID() }] },
    n,
  });
  const strip = ({ n: _n, ...operation }: ReturnType<typeof marks>) => operation;

  const count = async (query: ReturnType<typeof sql>): Promise<number> => {
    const [rows] = (await connection.db.execute(query)) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n);
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
    const [rooms] = (await connection.db.execute(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    for (const n of [1, 2, 3, 4]) {
      await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-SYN-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: rooms[0]?.id });
    }
    const [enrollments] = (await connection.db.execute(sql`SELECT id FROM inscripciones ORDER BY id`)) as unknown as [{ id: number }[]];
    enrollmentIds = enrollments.map((row) => row.id);
    journeyId = (await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' })).body.id;
    // Un ticket de seguimiento para las llamadas capturadas sin conexión.
    const yesterdayJourney = await call('post', '/asistencia/jornadas', DIRECTORA, { date: yesterday, shift: 'MATUTINO' });
    await call('post', `/asistencia/jornadas/${yesterdayJourney.body.id}/registros`, DOCENTE, { marks: [{ enrollmentId: enrollmentIds[0], status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() }] });
    await app.get(FollowUpsGeneratorService).generateDue(new Date());
    const [ticket] = (await connection.db.execute(sql`SELECT id FROM seguimientos LIMIT 1`)) as unknown as [{ id: number }[]];
    ticketId = ticket[0]?.id ?? 0;
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('exige sesión y rechaza cuerpos inválidos o lotes demasiado grandes', async () => {
    expect((await request(app.getHttpServer()).post('/sincronizacion').send({ operations: [] })).status).toBe(401);
    expect((await sync(DOCENTE)).status).toBe(400);
    expect((await call('post', '/sincronizacion', DOCENTE, { operations: [{ operationId: 'no-uuid', type: 'ATTENDANCE_MARKS' }] })).status).toBe(400);
    const many = Array.from({ length: 51 }, () => strip(marks(0, enrollmentIds[0] ?? 0, 'PRESENTE')));
    expect((await sync(DOCENTE, ...many)).status).toBe(400);
  });

  it('aplica el pase de lista capturado sin conexión con la hora en que se hizo, no con la de la sincronización', async () => {
    const captured = hoursAgo(3);
    const { status, results } = await sync(DOCENTE, strip(marks(1, enrollmentIds[1] ?? 0, 'PRESENTE', captured)));
    expect(status).toBe(200);
    expect(results[0]).toMatchObject({ status: 'APLICADA', replayed: false, saved: 1, rejections: [] });
    const [rows] = (await connection.db.execute(
      sql`SELECT UNIX_TIMESTAMP(registrado_at) AS registrado, UNIX_TIMESTAMP(hora_entrada) AS entrada FROM asistencias WHERE inscripcion_id = ${enrollmentIds[1]} AND jornada_id = ${journeyId}`,
    )) as unknown as [{ registrado: number; entrada: number }[]];
    const expected = Math.floor(new Date(captured).getTime() / 1000);
    expect(Math.abs(Number(rows[0]?.registrado) - expected)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(rows[0]?.entrada) - expected)).toBeLessThanOrEqual(1);
  });

  it('reenviar el mismo lote devuelve el mismo acuse sin repetir nada', async () => {
    const operation = strip(marks(2, enrollmentIds[2] ?? 0, 'PRESENTE'));
    const first = await sync(DOCENTE, operation);
    const registros = await count(sql`SELECT COUNT(*) AS n FROM asistencias`);
    const auditadas = await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'ASISTENCIA_REGISTRADA'`);
    const again = await sync(DOCENTE, operation);
    expect(first.results[0]).toMatchObject({ status: 'APLICADA', replayed: false, saved: 1 });
    expect(again.results[0]).toMatchObject({ status: 'APLICADA', replayed: true, saved: 1 });
    expect(await count(sql`SELECT COUNT(*) AS n FROM asistencias`)).toBe(registros);
    expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'ASISTENCIA_REGISTRADA'`)).toBe(auditadas);
    expect(await count(sql`SELECT COUNT(*) AS n FROM sincronizaciones WHERE uuid_operacion = ${operation.operationId}`)).toBe(1);
  });

  it('una operación con marcas válidas e inválidas se aplica en parte y detalla cada rechazo', async () => {
    const operation = { ...strip(marks(3, enrollmentIds[3] ?? 0, 'FILTRO_SANITARIO')), payload: { journeyId, marks: [
      { enrollmentId: enrollmentIds[3], status: 'FILTRO_SANITARIO', clientId: randomUUID() },
      { enrollmentId: 999999, status: 'PRESENTE', clientId: randomUUID() },
    ] } };
    const { results } = await sync(DOCENTE, operation);
    expect(results[0]).toMatchObject({ status: 'PARCIAL', saved: 1, rejections: [{ ref: 999999, code: 'INSCRIPCION_INVALIDA' }] });
  });

  it('el acuse no trae nombres ni datos de menores', async () => {
    const response = await call('post', '/sincronizacion', DOCENTE, { operations: [strip(marks(4, enrollmentIds[1] ?? 0, 'PRESENTE'))] });
    expect(JSON.stringify(response.body)).not.toMatch(/Infante|M-SYN|Prueba/);
  });

  it('el mismo identificador con otro contenido se rechaza y no se ejecuta', async () => {
    const id = randomUUID();
    await sync(DOCENTE, strip(marks(5, enrollmentIds[0] ?? 0, 'PRESENTE', hoursAgo(2), id)));
    const { results } = await sync(DOCENTE, strip(marks(5, enrollmentIds[0] ?? 0, 'FALTA_INJUSTIFICADA', hoursAgo(2), id)));
    expect(results[0]).toMatchObject({ status: 'RECHAZADA', code: 'OPERACION_REUTILIZADA' });
  });

  it('un rechazo del dominio no detiene el resto del lote y también queda guardado', async () => {
    const stray = { ...strip(marks(6, 1, 'PRESENTE')), payload: { journeyId: 999999, marks: [{ enrollmentId: 1, status: 'PRESENTE', clientId: randomUUID() }] } };
    const fine = strip(marks(7, enrollmentIds[1] ?? 0, 'PRESENTE'));
    const { results } = await sync(DOCENTE, stray, fine);
    expect(results.map((r) => r.status)).toEqual(['RECHAZADA', 'APLICADA']);
    expect(results[0]?.code).toBe('NO_ENCONTRADO');
    expect((await sync(DOCENTE, stray)).results[0]).toMatchObject({ status: 'RECHAZADA', replayed: true });
  });

  it('cada operación se autoriza por tipo: la docente no registra llamadas y trabajo social no pasa lista', async () => {
    const contact = { operationId: randomUUID(), type: 'FOLLOW_UP_CONTACT', capturedAt: hoursAgo(1), payload: { followUpId: ticketId, contact: { result: 'SIN_RESPUESTA' } } };
    expect((await sync(DOCENTE, contact)).results[0]).toMatchObject({ status: 'RECHAZADA', code: 'SIN_PERMISO' });
    expect((await sync(SOCIAL_WORK, strip(marks(8, enrollmentIds[1] ?? 0, 'PRESENTE')))).results[0]).toMatchObject({ status: 'RECHAZADA', code: 'SIN_PERMISO' });
  });

  it('una llamada capturada sin conexión se registra con su hora y programa el segundo intento desde ella', async () => {
    const captured = hoursAgo(3);
    const operation = { operationId: randomUUID(), type: 'FOLLOW_UP_CONTACT', capturedAt: captured, payload: { followUpId: ticketId, contact: { result: 'SIN_RESPUESTA' } } };
    const { results } = await sync(SOCIAL_WORK, operation);
    expect(results[0]).toMatchObject({ status: 'APLICADA', saved: 1 });
    const [rows] = (await connection.db.execute(
      sql`SELECT UNIX_TIMESTAMP(fecha_hora) AS llamada, UNIX_TIMESTAMP(proximo_intento_at) AS proximo FROM contactos_seguimiento WHERE uuid_operacion = ${operation.operationId}`,
    )) as unknown as [{ llamada: number; proximo: number }[]];
    const expected = Math.floor(new Date(captured).getTime() / 1000);
    expect(Math.abs(Number(rows[0]?.llamada) - expected)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(rows[0]?.proximo) - (expected + 4 * 3600))).toBeLessThanOrEqual(1);
  });

  it('si se pierde el acuse, reenviar la llamada no la duplica: la base misma lo impide', async () => {
    const operation = { operationId: randomUUID(), type: 'FOLLOW_UP_CONTACT', capturedAt: hoursAgo(2), payload: { followUpId: ticketId, contact: { result: 'SIN_RESPUESTA' } } };
    await sync(SOCIAL_WORK, operation);
    const antes = await count(sql`SELECT COUNT(*) AS n FROM contactos_seguimiento`);
    await connection.db.execute(sql`DELETE FROM sincronizaciones WHERE uuid_operacion = ${operation.operationId}`);
    const { results } = await sync(SOCIAL_WORK, operation);
    expect(results[0]).toMatchObject({ status: 'APLICADA', replayed: false });
    expect(await count(sql`SELECT COUNT(*) AS n FROM contactos_seguimiento`)).toBe(antes);
  });

  it('lo capturado antes de que se cerrara la jornada se acepta tarde; lo capturado después se rechaza', async () => {
    const beforeClose = strip(marks(9, enrollmentIds[1] ?? 0, 'AUSENTE_JUSTIFICADO', hoursAgo(1)));
    expect((await call('post', `/asistencia/jornadas/${journeyId}/cierre`, DIRECTORA)).status).toBe(201);
    await new Promise((done) => setTimeout(done, 1200));
    const afterClose = strip(marks(10, enrollmentIds[2] ?? 0, 'FALTA_INJUSTIFICADA', new Date().toISOString()));
    const { results } = await sync(DOCENTE, beforeClose, afterClose);
    expect(results[0]).toMatchObject({ status: 'APLICADA', saved: 1 });
    expect(results[1]).toMatchObject({ status: 'RECHAZADA', code: 'CONFLICTO' });
  });
});
