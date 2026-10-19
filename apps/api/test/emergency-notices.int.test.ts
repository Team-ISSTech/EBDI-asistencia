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
import { EncryptionService } from '../src/common/crypto/encryption.service';
import { MESSAGE_CHANNEL, type SendResult } from '../src/modules/emergency-notices/channels/message-channel';
import { EmergencyNoticesService } from '../src/modules/emergency-notices/services/emergency-notices.service';
import { FollowUpsGeneratorService } from '../src/modules/follow-ups/services/follow-ups-generator.service';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';
const SOCIAL_WORK = 'trabajo_social@sirai.test';
const MS_PER_DAY = 86_400_000;
const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);

/** Un canal de mentira que registra a quién se le escribió; nunca sale a internet. */
const channel = { enabled: true, sent: [] as string[], next: { ok: true, messageId: 'wamid.int' } as SendResult, send(phone: string) { this.sent.push(phone); return Promise.resolve(this.next); } };

/** RF-27 contra MySQL real: el segundo intento sin respuesta deja avisos, y el proceso los envía una sola vez. */
describe.skipIf(!TEST_DATABASE_URL)('avisos a contactos de emergencia (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let followUpId = 0;

  const call = async (method: 'get' | 'post', path: string, email: string, body?: object): Promise<request.Response> => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = login.get('set-cookie');
    const cookie = (Array.isArray(header) ? header[0] : header)?.split(';')[0] ?? '';
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };

  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];
  const firstId = async (query: ReturnType<typeof sql>): Promise<number> => {
    const [row] = await rows<{ id: number }>(query);
    if (!row) throw new Error('Sin filas');
    return row.id;
  };
  const notices = () => rows<{ guardian: string; status: string; attempts: number; error: string | null }>(sql`SELECT t.nombre AS guardian, a.estado AS status, a.intentos AS attempts, a.error_codigo AS error FROM avisos_emergencia a JOIN tutores t ON t.id = a.tutor_id ORDER BY a.id`);

  const addGuardian = async (childId: number, name: string, phone: string | null, emergency: boolean): Promise<void> => {
    const encryption = app.get(EncryptionService);
    const encrypted = phone === null ? null : encryption.encrypt(phone);
    await connection.db.execute(sql`INSERT INTO tutores (nombre, apellido_paterno, telefono_cifrado, created_at, updated_at) VALUES (${name}, 'Prueba', ${encrypted}, NOW(6), NOW(6))`);
    const guardianId = await firstId(sql`SELECT id FROM tutores WHERE nombre = ${name}`);
    await connection.db.execute(sql`INSERT INTO infante_tutor (infante_id, tutor_id, parentesco, es_contacto_emergencia, vigencia_desde, created_at, updated_at) VALUES (${childId}, ${guardianId}, 'Tía', ${emergency ? 1 : 0}, '2020-01-01', NOW(6), NOW(6))`);
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MESSAGE_CHANNEL).useValue(channel).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const roomId = await firstId(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`);
    await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-AVI-1', name: 'Infante', paternalSurname: 'Aviso', birthDate: recentBirthDate, roomId });
    const childId = await firstId(sql`SELECT id FROM infantes ORDER BY id LIMIT 1`);
    await addGuardian(childId, 'Contacto1', '5512345678', true);
    await addGuardian(childId, 'Contacto2', null, true);
    await addGuardian(childId, 'Tutor3', '5587654321', false);
    const enrollmentId = await firstId(sql`SELECT id FROM inscripciones ORDER BY id LIMIT 1`);
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: yesterday, shift: 'MATUTINO' });
    await call('post', `/asistencia/jornadas/${journey.body.id}/registros`, 'docente@sirai.test', { marks: [{ enrollmentId, status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() }] });
    await app.get(FollowUpsGeneratorService).generateDue(new Date());
    followUpId = await firstId(sql`SELECT id FROM seguimientos`);
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('el primer intento sin respuesta no deja avisos', async () => {
    expect((await call('post', `/seguimientos/${followUpId}/contactos`, SOCIAL_WORK, { result: 'SIN_RESPUESTA' })).status).toBe(201);
    expect(await notices()).toEqual([]);
  });

  it('el segundo intento deja un aviso por contacto de emergencia, no por el resto de los tutores', async () => {
    const second = await call('post', `/seguimientos/${followUpId}/contactos`, SOCIAL_WORK, { result: 'SIN_RESPUESTA' });
    expect(second.body).toMatchObject({ emergencyAlert: true });
    expect(await notices()).toEqual([
      { guardian: 'Contacto1', status: 'PENDIENTE', attempts: 0, error: null },
      { guardian: 'Contacto2', status: 'PENDIENTE', attempts: 0, error: null },
    ]);
  });

  it('un tercer intento sin respuesta no duplica los avisos', async () => {
    await call('post', `/seguimientos/${followUpId}/contactos`, SOCIAL_WORK, { result: 'SIN_RESPUESTA' });
    expect(await notices()).toHaveLength(2);
  });

  it('envía al contacto con teléfono y marca al otro como sin teléfono', async () => {
    expect(await app.get(EmergencyNoticesService).dispatchDue(new Date())).toBe(2);
    expect(channel.sent).toEqual(['525512345678']);
    expect(await notices()).toEqual([
      { guardian: 'Contacto1', status: 'ENVIADO', attempts: 1, error: null },
      { guardian: 'Contacto2', status: 'SIN_TELEFONO', attempts: 0, error: 'SIN_TELEFONO' },
    ]);
  });

  it('no vuelve a enviar lo ya procesado', async () => {
    expect(await app.get(EmergencyNoticesService).dispatchDue(new Date())).toBe(0);
    expect(channel.sent).toHaveLength(1);
  });

  it('audita los resultados como el sistema', async () => {
    const entries = await rows<{ action: string; role: string; user_id: number | null }>(sql`SELECT accion AS action, rol_codigo AS role, usuario_id AS user_id FROM auditoria WHERE accion LIKE 'AVISO_EMERGENCIA%' ORDER BY id`);
    expect(entries).toEqual([
      { action: 'AVISO_EMERGENCIA_ENVIADO', role: 'SISTEMA', user_id: null },
      { action: 'AVISO_EMERGENCIA_FALLIDO', role: 'SISTEMA', user_id: null },
    ]);
  });

  it('un aviso reservado por otra instancia no se envía hasta que venza la reserva', async () => {
    await connection.db.execute(sql`UPDATE avisos_emergencia SET estado = 'PENDIENTE', enviado_at = NULL, proximo_intento_at = DATE_ADD(NOW(6), INTERVAL 5 MINUTE) WHERE estado = 'ENVIADO'`);
    expect(await app.get(EmergencyNoticesService).dispatchDue(new Date())).toBe(0);
    expect(await app.get(EmergencyNoticesService).dispatchDue(new Date(Date.now() + 6 * 60_000))).toBe(1);
  });
});
