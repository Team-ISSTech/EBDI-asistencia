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

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';
const MS_PER_DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);
const lastWeek = new Date(Date.now() - 7 * MS_PER_DAY).toISOString().slice(0, 10);

/** Editar y dar de baja infantes y tutores (RF-33, RF-34) contra MySQL real, con borrado lógico y auditoría. */
describe.skipIf(!TEST_DATABASE_URL)('edición de infantes y tutores (integración)', () => {
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

  /** La cookie se resuelve antes de crear la petición: supertest no admite dos a la vez sobre el mismo servidor. */
  const call = async (method: 'get' | 'post' | 'patch' | 'delete', path: string, email: string, body?: object): Promise<request.Response> => {
    const cookie = await cookieFor(email);
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };

  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];

  const newChild = async (n: string) =>
    (await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-ED-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId })).body as { id: number };

  const newGuardian = async (childId: number, phone: string, extra: object = {}) => {
    const guardian = (await call('post', '/tutores', DIRECTORA, { name: 'Tutor', paternalSurname: 'Prueba', phone })).body as { id: number };
    await call('post', `/infantes/${childId}/tutores`, DIRECTORA, { guardianId: guardian.id, relationship: 'Madre', validFrom: lastWeek, ...extra });
    return guardian.id;
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
    roomId = (await rows<{ id: number }>(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`))[0]?.id ?? 0;
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo quien administra infantes edita; la docente y los roles centrales no', async () => {
    const child = await newChild('1');
    for (const email of ['docente@sirai.test', 'medico@sirai.test', 'admin_central@sirai.test', 'supervisor_central@sirai.test']) {
      expect((await call('patch', `/infantes/${child.id}`, email, { name: 'X' })).status).toBe(403);
      expect((await call('delete', `/infantes/${child.id}`, email)).status).toBe(403);
    }
  });

  it('edita al infante, cifra la discapacidad y deja en la bitácora solo los nombres de los campos', async () => {
    const child = await newChild('2');
    const response = await call('patch', `/infantes/${child.id}`, DIRECTORA, { name: 'Ana', hasDisability: true, disabilityGroup: 'Motriz' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: child.id, name: 'Ana', enrollmentNumber: 'M-ED-2', hasDisability: true });
    const [stored] = await rows<{ cifrado: Buffer }>(sql`SELECT grupo_discapacidad_cifrado AS cifrado FROM infantes WHERE id = ${child.id}`);
    expect(stored?.cifrado.toString('utf8')).not.toContain('Motriz');
    const audit = await rows<{ accion: string }>(sql`SELECT accion FROM auditoria WHERE registro_id = ${String(child.id)} AND accion = 'INFANTE_ACTUALIZADO'`);
    expect(audit).toHaveLength(1);
  });

  it('una CURP repetida responde 409 y no cambia nada', async () => {
    const [a, b] = [await newChild('3'), await newChild('4')];
    const curp = 'ABCD010203HDFXYZ05';
    expect((await call('patch', `/infantes/${a.id}`, DIRECTORA, { curp })).status).toBe(200);
    const duplicate = await call('patch', `/infantes/${b.id}`, DIRECTORA, { curp });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICTO');
  });

  it('rechaza cuerpos vacíos o con un grupo de discapacidad sin discapacidad', async () => {
    const child = await newChild('5');
    expect((await call('patch', `/infantes/${child.id}`, DIRECTORA, {})).status).toBe(400);
    expect((await call('patch', `/infantes/${child.id}`, DIRECTORA, { disabilityGroup: 'Motriz' })).status).toBe(400);
  });

  it('eliminar marca el borrado lógico en infante e inscripciones, atribuido a la directora, y lo oculta del padrón', async () => {
    const child = await newChild('6');
    expect((await call('delete', `/infantes/${child.id}`, DIRECTORA)).status).toBe(204);
    const [row] = await rows<{ borrado: number; por: number | null; ins: number }>(
      sql`SELECT (i.deleted_at IS NOT NULL) AS borrado, i.deleted_by AS por, (SELECT COUNT(*) FROM inscripciones n WHERE n.infante_id = i.id AND n.deleted_at IS NOT NULL) AS ins FROM infantes i WHERE i.id = ${child.id}`,
    );
    expect(Number(row?.borrado)).toBe(1);
    expect(row?.por).not.toBeNull();
    expect(Number(row?.ins)).toBe(1);
    const list = await call('get', '/infantes', DIRECTORA);
    expect((list.body.children as { id: number }[]).some((c) => c.id === child.id)).toBe(false);
    expect((await call('patch', `/infantes/${child.id}`, DIRECTORA, { name: 'X' })).status).toBe(404);
  });

  it('no elimina a un infante con asistencia: responde 409 y sigue en el padrón', async () => {
    const child = await newChild('7');
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' });
    const [enrollment] = await rows<{ id: number }>(sql`SELECT id FROM inscripciones WHERE infante_id = ${child.id}`);
    const marked = await call('post', `/asistencia/jornadas/${journey.body.id}/registros`, 'docente@sirai.test', {
      marks: [{ enrollmentId: enrollment?.id, status: 'PRESENTE', clientId: randomUUID() }],
    });
    expect(marked.status).toBe(200);
    const response = await call('delete', `/infantes/${child.id}`, DIRECTORA);
    expect(response.status).toBe(409);
    const list = await call('get', '/infantes', DIRECTORA);
    expect((list.body.children as { id: number }[]).some((c) => c.id === child.id)).toBe(true);
  });

  it('edita al tutor: el teléfono nuevo se cifra de nuevo y el anterior deja de revelarse', async () => {
    const child = await newChild('8');
    const guardianId = await newGuardian(child.id, '5512345678');
    const response = await call('patch', `/tutores/${guardianId}`, DIRECTORA, { name: 'Marta', phone: '(55) 9876-5432' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Marta' });
    expect(JSON.stringify(response.body)).not.toContain('9876');
    const phone = await call('get', `/tutores/${guardianId}/telefono`, 'trabajo_social@sirai.test');
    expect(phone.body).toEqual({ phone: '5598765432' });
    const [stored] = await rows<{ t: Buffer }>(sql`SELECT telefono_cifrado AS t FROM tutores WHERE id = ${guardianId}`);
    expect(stored?.t.toString('utf8')).not.toContain('5598765432');
  });

  it('un tutor sin vínculo con la estancia no se edita', async () => {
    const orphan = await call('post', '/tutores', DIRECTORA, { name: 'Suelto', paternalSurname: 'Prueba', phone: '5511112222' });
    expect((await call('patch', `/tutores/${orphan.body.id}`, DIRECTORA, { name: 'X' })).status).toBe(404);
  });

  it('cambia los permisos del vínculo y desvincular lo deja como historial sin borrar al tutor', async () => {
    const child = await newChild('9');
    const guardianId = await newGuardian(child.id, '5533334444', { isPrimary: true, canPickUp: true });
    const changed = await call('patch', `/infantes/${child.id}/tutores/${guardianId}`, DIRECTORA, { canPickUp: false });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ canPickUp: false, isPrimary: true });

    expect((await call('delete', `/infantes/${child.id}/tutores/${guardianId}`, DIRECTORA)).status).toBe(204);
    const list = await call('get', `/infantes/${child.id}/tutores`, DIRECTORA);
    expect(list.body.guardians).toHaveLength(0);
    const [link] = await rows<{ hasta: string; principal: number }>(
      sql`SELECT DATE_FORMAT(vigencia_hasta, '%Y-%m-%d') AS hasta, es_tutor_principal AS principal FROM infante_tutor WHERE infante_id = ${child.id} AND tutor_id = ${guardianId}`,
    );
    expect(link?.hasta).toBe(new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10));
    expect(Number(link?.principal)).toBe(0);
    const [guardian] = await rows<{ borrado: number }>(sql`SELECT (deleted_at IS NOT NULL) AS borrado FROM tutores WHERE id = ${guardianId}`);
    expect(Number(guardian?.borrado)).toBe(0);
    expect((await call('delete', `/infantes/${child.id}/tutores/${guardianId}`, DIRECTORA)).status).toBe(404);
  });

  it('un vínculo de hoy se desvincula con borrado lógico y el tutor se puede vincular otra vez', async () => {
    const child = await newChild('10');
    const guardianId = await newGuardian(child.id, '5544445555', { validFrom: today, isPrimary: false });
    expect((await call('delete', `/infantes/${child.id}/tutores/${guardianId}`, DIRECTORA)).status).toBe(204);
    const [row] = await rows<{ borrado: number; por: number | null }>(
      sql`SELECT (deleted_at IS NOT NULL) AS borrado, deleted_by AS por FROM infante_tutor WHERE infante_id = ${child.id} AND tutor_id = ${guardianId}`,
    );
    expect(Number(row?.borrado)).toBe(1);
    expect(row?.por).not.toBeNull();
    expect((await call('get', `/infantes/${child.id}/tutores`, DIRECTORA)).body.guardians).toHaveLength(0);

    const again = await call('post', `/infantes/${child.id}/tutores`, DIRECTORA, { guardianId, relationship: 'Tía', validFrom: today });
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ id: guardianId, relationship: 'Tía' });
    const [revived] = await rows<{ borrado: number }>(sql`SELECT (deleted_at IS NOT NULL) AS borrado FROM infante_tutor WHERE infante_id = ${child.id} AND tutor_id = ${guardianId}`);
    expect(Number(revived?.borrado)).toBe(0);
    expect((await call('post', `/infantes/${child.id}/tutores`, DIRECTORA, { guardianId, relationship: 'Tía', validFrom: today })).status).toBe(409);
  });

  it('un tutor desvinculado con vigencia terminada también se puede vincular de nuevo', async () => {
    const child = await newChild('11');
    const guardianId = await newGuardian(child.id, '5566667777');
    await call('delete', `/infantes/${child.id}/tutores/${guardianId}`, DIRECTORA);
    const again = await call('post', `/infantes/${child.id}/tutores`, DIRECTORA, { guardianId, relationship: 'Madre', validFrom: today });
    expect(again.status).toBe(201);
    expect(again.body.validUntil).toBeNull();
  });

  it('audita cada cambio con la acción de su operación', async () => {
    const actions = await rows<{ accion: string }>(sql`SELECT DISTINCT accion FROM auditoria ORDER BY accion`);
    expect(actions.map((a) => a.accion)).toEqual(
      expect.arrayContaining(['INFANTE_ACTUALIZADO', 'INFANTE_ELIMINADO', 'TUTOR_ACTUALIZADO', 'TUTOR_VINC_ACTUALIZADO', 'TUTOR_DESVINCULADO']),
    );
  });
});
