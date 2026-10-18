import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { pendingTransferListResponseSchema, transferDestinationListResponseSchema } from '@sirai/contracts';
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
const DESTINO = 'directora2@sirai.test';
const MS_PER_DAY = 86_400_000;
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);

/** Cambio de sala, baja, traslado y recepción (RF-35) contra MySQL real. */
describe.skipIf(!TEST_DATABASE_URL)('movimientos de inscripción (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let originRooms: number[] = [];
  let destinationRoom = 0;

  const cookieFor = async (email: string, password = SEED_PASSWORD): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error(`Sin cookie para ${email}`);
    return cookie.split(';')[0] ?? '';
  };

  /** La cookie se resuelve antes de crear la petición: supertest no admite dos a la vez sobre el mismo servidor. */
  const call = async (method: 'get' | 'post' | 'patch', path: string, email: string, body?: object): Promise<request.Response> => {
    const cookie = await cookieFor(email, email === DESTINO ? 'Definitiva-2026-x' : SEED_PASSWORD);
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };

  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];

  const newChild = async (n: string, roomId = originRooms[0]) =>
    (await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-MOV-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId })).body as { id: number };

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
    originRooms = (await rows<{ id: number }>(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id`)).map((r) => r.id);
    await call('post', '/usuarios', 'admin_central@sirai.test', {
      name: 'Directora Destino',
      email: DESTINO,
      temporaryPassword: 'Temporal-2026',
      assignments: [{ role: 'DIRECTORA', estanciaId: 2 }],
    });
    // La contraseña temporal solo sirve para cambiarla: sin esto la directora de destino no podría operar.
    const first = await request(app.getHttpServer()).post('/auth/login').send({ email: DESTINO, password: 'Temporal-2026' });
    await request(app.getHttpServer())
      .post('/auth/contrasena')
      .set('Cookie', (first.get('set-cookie')?.[0] ?? '').split(';')[0] ?? '')
      .send({ currentPassword: 'Temporal-2026', newPassword: 'Definitiva-2026-x' });
    const room = await call('post', '/administracion/salas', DESTINO, { name: 'Sala destino', shift: 'MATUTINO', minAgeMonths: 0, maxAgeMonths: 48, capacity: 10 });
    destinationRoom = room.body.id;
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo quien administra infantes mueve inscripciones', async () => {
    const child = await newChild('0');
    for (const email of ['docente@sirai.test', 'medico@sirai.test', 'admin_central@sirai.test', 'supervisor_central@sirai.test']) {
      expect((await call('post', `/infantes/${child.id}/movimientos`, email, { type: 'BAJA', reason: 'x' })).status).toBe(403);
      expect((await call('get', '/traslados/pendientes', email)).status).toBe(403);
    }
  });

  it('cambio de sala: mueve al infante y deja el movimiento con sala anterior y nueva', async () => {
    const second = (await call('post', '/administracion/salas', DIRECTORA, { name: 'Sala B', shift: 'MATUTINO', capacity: 5 })).body.id as number;
    const child = await newChild('1');
    const response = await call('post', `/infantes/${child.id}/movimientos`, DIRECTORA, { type: 'CAMBIO_SALA', roomId: second, reason: 'Edad' });
    expect(response.status).toBe(204);
    const list = await call('get', '/infantes', DIRECTORA);
    expect((list.body.children as { id: number; roomId: number }[]).find((c) => c.id === child.id)?.roomId).toBe(second);
    const [movement] = await rows<{ tipo: string; antes: number; despues: number; motivo: string }>(
      sql`SELECT m.tipo_movimiento AS tipo, m.sala_anterior_id AS antes, m.sala_nueva_id AS despues, m.motivo FROM movimientos_inscripcion m JOIN inscripciones i ON i.id = m.inscripcion_id WHERE i.infante_id = ${child.id} AND m.tipo_movimiento = 'CAMBIO_SALA'`,
    );
    expect(movement).toMatchObject({ tipo: 'CAMBIO_SALA', antes: originRooms[0], despues: second, motivo: 'Edad' });
    expect((await call('post', `/infantes/${child.id}/movimientos`, DIRECTORA, { type: 'CAMBIO_SALA', roomId: second })).status).toBe(409);
  });

  it('una sala llena o de otra estancia no recibe al infante', async () => {
    const tiny = (await call('post', '/administracion/salas', DIRECTORA, { name: 'Sala mínima', shift: 'MATUTINO', capacity: 1 })).body.id as number;
    const [a, b] = [await newChild('2'), await newChild('3')];
    expect((await call('post', `/infantes/${a.id}/movimientos`, DIRECTORA, { type: 'CAMBIO_SALA', roomId: tiny })).status).toBe(204);
    expect((await call('post', `/infantes/${b.id}/movimientos`, DIRECTORA, { type: 'CAMBIO_SALA', roomId: tiny })).status).toBe(409);
    expect((await call('post', `/infantes/${b.id}/movimientos`, DIRECTORA, { type: 'CAMBIO_SALA', roomId: destinationRoom })).status).toBe(404);
  });

  it('baja: exige motivo, cierra la inscripción con fecha de fin, marca al infante y lo saca del padrón', async () => {
    const child = await newChild('4');
    expect((await call('post', `/infantes/${child.id}/movimientos`, DIRECTORA, { type: 'BAJA' })).status).toBe(400);
    expect((await call('post', `/infantes/${child.id}/movimientos`, DIRECTORA, { type: 'BAJA', reason: 'Cambio de domicilio' })).status).toBe(204);
    const [row] = await rows<{ ins: string; fin: string | null; infante: string; borrado: number }>(
      sql`SELECT i.estatus AS ins, DATE_FORMAT(i.fecha_fin, '%Y-%m-%d') AS fin, c.estatus AS infante, (i.deleted_at IS NOT NULL) AS borrado FROM inscripciones i JOIN infantes c ON c.id = i.infante_id WHERE c.id = ${child.id}`,
    );
    expect(row).toMatchObject({ ins: 'BAJA', infante: 'BAJA' });
    expect(row?.fin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(row?.borrado)).toBe(0);
    const list = await call('get', '/infantes', DIRECTORA);
    expect((list.body.children as { id: number }[]).some((c) => c.id === child.id)).toBe(false);
    expect((await call('post', `/infantes/${child.id}/movimientos`, DIRECTORA, { type: 'BAJA', reason: 'otra vez' })).status).toBe(404);
  });

  it('traslado completo: sale del origen, aparece pendiente en el destino y su recepción lo inscribe', async () => {
    const child = await newChild('5');
    const destinations = transferDestinationListResponseSchema.parse((await call('get', '/traslados/destinos', DIRECTORA)).body);
    expect(destinations.estancias.map((e) => e.code)).toEqual(['EBDI-TEST-02']);
    const toId = destinations.estancias[0]?.id ?? 0;

    expect((await call('post', `/infantes/${child.id}/movimientos`, DIRECTORA, { type: 'TRASLADO', destinationEstanciaId: 1, reason: 'x' })).status).toBe(400);
    expect((await call('post', `/infantes/${child.id}/movimientos`, DIRECTORA, { type: 'TRASLADO', destinationEstanciaId: toId, reason: 'Mudanza' })).status).toBe(204);
    expect(((await call('get', '/infantes', DIRECTORA)).body.children as { id: number }[]).some((c) => c.id === child.id)).toBe(false);

    expect(pendingTransferListResponseSchema.parse((await call('get', '/traslados/pendientes', DIRECTORA)).body).transfers).toHaveLength(0);
    const pending = pendingTransferListResponseSchema.parse((await call('get', '/traslados/pendientes', DESTINO)).body).transfers;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ childName: 'Infante5 Prueba', enrollmentNumber: 'M-MOV-5', fromEstanciaName: 'Estancia de prueba 01', reason: 'Mudanza' });
    const enrollmentId = pending[0]?.enrollmentId ?? 0;

    expect((await call('post', `/traslados/${enrollmentId}/recepcion`, DIRECTORA, { roomId: originRooms[0] })).status).toBe(404);
    expect((await call('post', `/traslados/${enrollmentId}/recepcion`, DESTINO, { roomId: originRooms[0] })).status).toBe(404);
    expect((await call('post', `/traslados/${enrollmentId}/recepcion`, DESTINO, { roomId: destinationRoom })).status).toBe(204);

    expect(pendingTransferListResponseSchema.parse((await call('get', '/traslados/pendientes', DESTINO)).body).transfers).toHaveLength(0);
    const arrived = await call('get', '/infantes', DESTINO);
    expect((arrived.body.children as { id: number; roomId: number }[]).find((c) => c.id === child.id)?.roomId).toBe(destinationRoom);
    const movements = await rows<{ tipo: string }>(
      sql`SELECT m.tipo_movimiento AS tipo FROM movimientos_inscripcion m JOIN inscripciones i ON i.id = m.inscripcion_id WHERE i.infante_id = ${child.id} ORDER BY m.id`,
    );
    expect(movements.map((m) => m.tipo)).toEqual(['ALTA', 'TRASLADO', 'ALTA']);
    expect((await call('post', `/traslados/${enrollmentId}/recepcion`, DESTINO, { roomId: destinationRoom })).status).toBe(404);
  });

  it('audita cada movimiento y la consulta de traslados', async () => {
    const actions = await rows<{ accion: string }>(sql`SELECT DISTINCT accion FROM auditoria`);
    expect(actions.map((a) => a.accion)).toEqual(
      expect.arrayContaining(['INSCRIPCION_SALA_CAMBIADA', 'INSCRIPCION_BAJA', 'TRASLADO_SOLICITADO', 'TRASLADO_RECIBIDO', 'TRASLADOS_CONSULTADOS']),
    );
  });
});
