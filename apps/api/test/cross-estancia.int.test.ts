import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
const MS_PER_DAY = 86_400_000;
const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);
/** Marca que no debe aparecer jamás en una respuesta a un usuario de la estancia A. */
const SECRET_SURNAME = 'ReservadoB';

type Method = 'get' | 'post' | 'patch' | 'delete';
interface Attack {
  readonly name: string;
  readonly as: string;
  readonly method: Method;
  readonly path: () => string;
  readonly body?: () => object;
}

/**
 * RNF-06 / S-02: una persona con la estancia A activa no ve ni modifica nada de la
 * estancia B, aunque conozca los identificadores. La directora tiene asignación en las
 * dos estancias a propósito: el alcance lo da la estancia activa de la sesión, no los
 * roles que la persona tenga en otro lado.
 */
describe.skipIf(!TEST_DATABASE_URL)('aislamiento entre estancias (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  const ids = { child: 0, guardian: 0, consent: 0, journey: 0, enrollment: 0, followUp: 0, room: 0, estancia: 0 };

  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];
  const firstId = async (query: ReturnType<typeof sql>): Promise<number> => {
    const [row] = await rows<{ id: number }>(query);
    if (!row) throw new Error('Sin filas');
    return row.id;
  };
  const count = async (query: ReturnType<typeof sql>): Promise<number> => Number((await rows<{ n: number }>(query))[0]?.n);

  const login = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = response.get('set-cookie');
    return ((Array.isArray(header) ? header[0] : header) ?? '').split(';')[0] ?? '';
  };
  const send = async (cookie: string, method: Method, path: string, body?: object): Promise<request.Response> => {
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };
  const call = async (email: string, method: Method, path: string, body?: object): Promise<request.Response> => send(await login(email), method, path, body);

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '1000';
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    connection = connect(TEST_DATABASE_URL);
    await syncRolePermissions(connection.db);
    await seedDevelopmentData(connection.db, SEED_PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    ids.estancia = await firstId(sql`SELECT id FROM estancias WHERE clave_ebdi = 'EBDI-TEST-02'`);
    const directoraId = await firstId(sql`SELECT id FROM usuarios WHERE correo = ${DIRECTORA}`);
    const roleId = await firstId(sql`SELECT id FROM roles WHERE codigo = 'DIRECTORA'`);
    await connection.db.execute(sql`INSERT INTO usuario_rol (usuario_id, rol_id, estancia_id, vigente_desde) VALUES (${directoraId}, ${roleId}, ${ids.estancia}, NOW(6))`);

    // Los datos de la estancia B los crea la directora con la estancia B activa.
    const asB = await login(DIRECTORA);
    expect((await send(asB, 'post', '/auth/estancia', { estanciaId: ids.estancia })).status).toBe(200);
    await connection.db.execute(
      sql`INSERT INTO salas_grupos (estancia_id, nombre, turno, edad_minima_meses, edad_maxima_meses, capacidad, created_at, updated_at) VALUES (${ids.estancia}, 'Sala B', 'MATUTINO', 0, 48, 20, NOW(6), NOW(6))`,
    );
    ids.room = await firstId(sql`SELECT id FROM salas_grupos WHERE estancia_id = ${ids.estancia} AND turno = 'MATUTINO' ORDER BY id LIMIT 1`);
    const child = await send(asB, 'post', '/infantes', { enrollmentNumber: 'M-B-1', name: 'Infante', paternalSurname: SECRET_SURNAME, birthDate: recentBirthDate, roomId: ids.room });
    ids.child = child.body.id as number;
    const guardian = await send(asB, 'post', '/tutores', { name: 'Tutora', paternalSurname: SECRET_SURNAME, phone: '5512345678' });
    ids.guardian = guardian.body.id as number;
    await send(asB, 'post', `/infantes/${ids.child}/tutores`, { guardianId: ids.guardian, relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: yesterday });
    const consent = await send(asB, 'post', `/infantes/${ids.child}/consentimientos`, { guardianId: ids.guardian, type: 'CONTACTO_TELEFONICO' });
    ids.consent = consent.body.id as number;
    const journey = await send(asB, 'post', '/asistencia/jornadas', { date: yesterday, shift: 'MATUTINO' });
    ids.journey = journey.body.id as number;
    ids.enrollment = await firstId(sql`SELECT id FROM inscripciones WHERE infante_id = ${ids.child}`);
    await send(asB, 'post', `/asistencia/jornadas/${ids.journey}/registros`, { marks: [{ enrollmentId: ids.enrollment, status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() }] });
    await app.get(FollowUpsGeneratorService).generateDue(new Date());
    ids.followUp = await firstId(sql`SELECT id FROM seguimientos`);
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  const contact = { result: 'SIN_RESPUESTA' };
  const attacks: Attack[] = [
    { name: 'ver tutores del infante', as: 'trabajo_social@sirai.test', method: 'get', path: () => `/infantes/${ids.child}/tutores` },
    { name: 'vincular un tutor al infante', as: DIRECTORA, method: 'post', path: () => `/infantes/${ids.child}/tutores`, body: () => ({ guardianId: ids.guardian, relationship: 'Tío', validFrom: yesterday }) },
    { name: 'editar al infante', as: DIRECTORA, method: 'patch', path: () => `/infantes/${ids.child}`, body: () => ({ name: 'Cambiado' }) },
    { name: 'dar de baja al infante', as: DIRECTORA, method: 'delete', path: () => `/infantes/${ids.child}` },
    { name: 'ver consentimientos', as: 'trabajo_social@sirai.test', method: 'get', path: () => `/infantes/${ids.child}/consentimientos` },
    { name: 'registrar un consentimiento', as: DIRECTORA, method: 'post', path: () => `/infantes/${ids.child}/consentimientos`, body: () => ({ guardianId: ids.guardian, type: 'CONTACTO_TELEFONICO' }) },
    { name: 'revocar un consentimiento', as: DIRECTORA, method: 'post', path: () => `/consentimientos/${ids.consent}/revocar` },
    { name: 'editar al tutor', as: DIRECTORA, method: 'patch', path: () => `/tutores/${ids.guardian}`, body: () => ({ name: 'Cambiado' }) },
    { name: 'leer el teléfono del tutor', as: 'trabajo_social@sirai.test', method: 'get', path: () => `/tutores/${ids.guardian}/telefono` },
    { name: 'dar de baja al infante con un movimiento', as: DIRECTORA, method: 'post', path: () => `/infantes/${ids.child}/movimientos`, body: () => ({ type: 'BAJA', reason: 'prueba' }) },
    { name: 'descargar el expediente', as: DIRECTORA, method: 'get', path: () => `/expedientes/${ids.child}` },
    { name: 'ver la lista de la jornada', as: 'docente@sirai.test', method: 'get', path: () => `/asistencia/jornadas/${ids.journey}/lista` },
    { name: 'pasar lista en la jornada', as: 'docente@sirai.test', method: 'post', path: () => `/asistencia/jornadas/${ids.journey}/registros`, body: () => ({ marks: [{ enrollmentId: ids.enrollment, status: 'PRESENTE', clientId: randomUUID() }] }) },
    { name: 'cerrar la jornada', as: DIRECTORA, method: 'post', path: () => `/asistencia/jornadas/${ids.journey}/cierre` },
    { name: 'registrar una llamada', as: 'trabajo_social@sirai.test', method: 'post', path: () => `/seguimientos/${ids.followUp}/contactos`, body: () => contact },
    { name: 'leer las notas del seguimiento', as: 'trabajo_social@sirai.test', method: 'get', path: () => `/seguimientos/${ids.followUp}/contactos` },
    { name: 'registrar el alta médica', as: 'medico@sirai.test', method: 'post', path: () => `/seguimientos/${ids.followUp}/alta`, body: () => ({ dischargeDate: yesterday }) },
    { name: 'cerrar el seguimiento', as: 'trabajo_social@sirai.test', method: 'post', path: () => `/seguimientos/${ids.followUp}/cierre` },
    { name: 'editar la sala', as: DIRECTORA, method: 'patch', path: () => `/administracion/salas/${ids.room}`, body: () => ({ name: 'Cambiada' }) },
    { name: 'dar de baja la sala', as: DIRECTORA, method: 'post', path: () => `/administracion/salas/${ids.room}/baja` },
  ];

  it.each(attacks.map((attack) => [attack.name, attack] as const))('con la estancia A activa no se puede %s de la estancia B', async (_name, attack) => {
    const response = await call(attack.as, attack.method, attack.path(), attack.body?.());
    expect([403, 404]).toContain(response.status);
    expect(JSON.stringify(response.body)).not.toContain(SECRET_SURNAME);
  });

  it('la bandeja y las listas de la estancia A no incluyen nada de la B', async () => {
    for (const [email, path] of [['trabajo_social@sirai.test', '/seguimientos'], [DIRECTORA, '/infantes'], [DIRECTORA, '/tutores'], ['docente@sirai.test', '/asistencia/jornadas/activa?date=' + yesterday + '&shift=MATUTINO']] as const) {
      const response = await call(email, 'get', path);
      expect(JSON.stringify(response.body), path).not.toContain(SECRET_SURNAME);
    }
  });

  it('una operación sin conexión con identificadores de la estancia B se rechaza y no escribe nada', async () => {
    const operations = [
      { operationId: randomUUID(), type: 'ATTENDANCE_MARKS', capturedAt: new Date().toISOString(), payload: { journeyId: ids.journey, marks: [{ enrollmentId: ids.enrollment, status: 'PRESENTE', clientId: randomUUID() }] } },
      { operationId: randomUUID(), type: 'FOLLOW_UP_CONTACT', capturedAt: new Date().toISOString(), payload: { followUpId: ids.followUp, contact } },
    ];
    for (const [email, operation] of [['docente@sirai.test', operations[0]], ['trabajo_social@sirai.test', operations[1]]] as const) {
      const response = await call(email, 'post', '/sincronizacion', { operations: [operation] });
      expect(response.body.results[0].status, email).toBe('RECHAZADA');
    }
  });

  it('pasar lista en una jornada de la estancia A con una inscripción de la B no escribe nada', async () => {
    const asA = await login(DIRECTORA);
    const journey = await send(asA, 'post', '/asistencia/jornadas', { date: yesterday, shift: 'MATUTINO' });
    const response = await call('docente@sirai.test', 'post', `/asistencia/jornadas/${journey.body.id}/registros`, { marks: [{ enrollmentId: ids.enrollment, status: 'PRESENTE', clientId: randomUUID() }] });
    const rejected = response.status >= 400 || JSON.stringify(response.body.rejections ?? response.body.results ?? '').length > 2;
    expect(rejected).toBe(true);
    expect(await count(sql`SELECT COUNT(*) AS n FROM asistencias WHERE inscripcion_id = ${ids.enrollment} AND jornada_id = ${journey.body.id}`)).toBe(0);
  });

  it('después de todos los intentos, los datos de la estancia B siguen intactos', async () => {
    expect(await count(sql`SELECT COUNT(*) AS n FROM infantes WHERE id = ${ids.child} AND nombre = 'Infante' AND deleted_at IS NULL`)).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM tutores WHERE id = ${ids.guardian} AND nombre = 'Tutora' AND deleted_at IS NULL`)).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM inscripciones WHERE id = ${ids.enrollment} AND estatus = 'ACTIVA' AND deleted_at IS NULL`)).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM consentimientos WHERE id = ${ids.consent} AND revocado_at IS NULL`)).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM jornadas_asistencia WHERE id = ${ids.journey} AND estado = 'ABIERTA'`)).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM asistencias WHERE jornada_id = ${ids.journey} AND estado = 'FALTA_INJUSTIFICADA'`)).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM seguimientos WHERE id = ${ids.followUp} AND estado = 'ABIERTO'`)).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM contactos_seguimiento`)).toBe(0);
    expect(await count(sql`SELECT COUNT(*) AS n FROM salas_grupos WHERE id = ${ids.room} AND estatus = 'ACTIVO' AND deleted_at IS NULL AND nombre <> 'Cambiada'`)).toBe(1);
  });
});
