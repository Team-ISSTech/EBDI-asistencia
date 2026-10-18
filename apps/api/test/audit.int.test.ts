import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { auditFiltersResponseSchema, auditListResponseSchema } from '@sirai/contracts';
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
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);

/** Los valores que NO deben salir nunca de la consulta de auditoría. */
const SECRET_NAME = 'NombreSecretoDelInfante';
const SECRET_PHONE = '5511223344';
const SECRET_GROUP = 'GrupoMotrizSecreto';

/** Consulta de la bitácora (RF-11) contra MySQL real: permisos, filtros, paginación y cero valores. */
describe.skipIf(!TEST_DATABASE_URL)('consulta de auditoría (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let childId = 0;
  let directoraId = 0;

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

  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];
  const list = async (query = '') => auditListResponseSchema.parse((await call('get', `/auditoria${query}`, ADMIN)).body);

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
    const child = await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-AUD-1', name: 'Infante', paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: room?.id });
    childId = child.body.id;
    await call('patch', `/infantes/${childId}`, DIRECTORA, { name: SECRET_NAME, hasDisability: true, disabilityGroup: SECRET_GROUP });
    const guardian = await call('post', '/tutores', DIRECTORA, { name: 'Tutor', paternalSurname: 'Prueba', phone: SECRET_PHONE });
    await call('post', `/infantes/${childId}/tutores`, DIRECTORA, { guardianId: guardian.body.id, relationship: 'Madre', validFrom: recentBirthDate });
    await call('patch', `/tutores/${guardian.body.id}`, DIRECTORA, { phone: '5599887766' });
    const [row] = await rows<{ id: number }>(sql`SELECT id FROM usuarios WHERE correo = ${DIRECTORA}`);
    directoraId = row?.id ?? 0;
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo el administrador central consulta la bitácora', async () => {
    for (const email of [DIRECTORA, 'docente@sirai.test', 'trabajo_social@sirai.test', 'medico@sirai.test', 'supervisor_central@sirai.test']) {
      expect((await call('get', '/auditoria', email)).status).toBe(403);
      expect((await call('get', '/auditoria/filtros', email)).status).toBe(403);
    }
    expect((await call('get', '/auditoria', ADMIN)).status).toBe(200);
  });

  it('muestra quién, cuándo, qué acción, sobre qué registro y desde dónde', async () => {
    const { entries } = await list(`?action=INFANTE_ACTUALIZADO&recordId=${childId}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: directoraId,
      roleCode: 'DIRECTORA',
      action: 'INFANTE_ACTUALIZADO',
      tableName: 'infantes',
      recordId: String(childId),
      ipAddress: '127.0.0.1',
    });
    expect(entries[0]?.userName).toBeTruthy();
    expect(Number.isNaN(Date.parse(entries[0]?.occurredAt ?? ''))).toBe(false);
  });

  it('del cambio solo da los nombres de los campos, nunca los valores', async () => {
    const { entries } = await list(`?recordId=${childId}&action=INFANTE_ACTUALIZADO`);
    expect(entries[0]?.changedFields).toEqual(['disabilityGroup', 'hasDisability', 'name']);
    for (const path of ['/auditoria?limit=100', '/auditoria/filtros']) {
      const text = JSON.stringify((await call('get', path, ADMIN)).body);
      for (const secret of [SECRET_NAME, SECRET_PHONE, '5599887766', SECRET_GROUP]) expect(text).not.toContain(secret);
    }
  });

  it('filtra por acción, por persona y por tabla y registro', async () => {
    const byAction = await list('?action=TUTOR_ACTUALIZADO');
    expect(byAction.entries.length).toBeGreaterThan(0);
    expect(byAction.entries.every((e) => e.action === 'TUTOR_ACTUALIZADO')).toBe(true);
    expect(byAction.entries[0]?.changedFields).toEqual(['phone']);

    const byUser = await list(`?userId=${directoraId}&limit=100`);
    expect(byUser.entries.length).toBeGreaterThan(0);
    expect(byUser.entries.every((e) => e.userId === directoraId)).toBe(true);

    const byRecord = await list(`?table=infantes&recordId=${childId}&limit=100`);
    expect(byRecord.entries.every((e) => e.tableName === 'infantes' && e.recordId === String(childId))).toBe(true);
    expect(byRecord.entries.map((e) => e.action)).toEqual(expect.arrayContaining(['INFANTE_REGISTRADO', 'INFANTE_ACTUALIZADO']));
  });

  it('filtra por rango de fechas: lo de hoy aparece y lo de ayer no', async () => {
    const hour = 3_600_000;
    const now = Date.now();
    const today = await list(`?from=${encodeURIComponent(new Date(now - hour).toISOString())}&to=${encodeURIComponent(new Date(now + hour).toISOString())}&limit=100`);
    expect(today.entries.length).toBeGreaterThan(0);
    const past = await list(`?to=${encodeURIComponent(new Date(now - MS_PER_DAY).toISOString())}`);
    expect(past.entries).toHaveLength(0);
    const future = await list(`?from=${encodeURIComponent(new Date(now + MS_PER_DAY).toISOString())}`);
    expect(future.entries).toHaveLength(0);
  });

  it('rechaza un rango invertido, un límite fuera de rango y fechas inválidas con 400', async () => {
    expect((await call('get', `/auditoria?from=${encodeURIComponent('2026-10-02T00:00:00.000Z')}&to=${encodeURIComponent('2026-10-01T00:00:00.000Z')}`, ADMIN)).status).toBe(400);
    expect((await call('get', '/auditoria?limit=0', ADMIN)).status).toBe(400);
    expect((await call('get', '/auditoria?limit=101', ADMIN)).status).toBe(400);
    expect((await call('get', '/auditoria?from=ayer', ADMIN)).status).toBe(400);
  });

  it('pagina sin repetir ni saltarse registros, del más reciente al más antiguo', async () => {
    const all = await list('?limit=100');
    const seen: number[] = [];
    let cursor: number | null = null;
    let pages = 0;
    do {
      const page = await list(`?limit=3${cursor === null ? '' : `&beforeId=${cursor}`}`);
      expect(page.entries.length).toBeLessThanOrEqual(3);
      seen.push(...page.entries.map((e) => e.id));
      cursor = page.nextBeforeId;
      pages += 1;
    } while (cursor !== null && pages < 100);
    // La propia consulta agrega registros mientras se pagina: lo que ya estaba debe aparecer completo y en orden.
    expect(seen.slice().sort((a, b) => b - a)).toEqual(seen);
    expect(new Set(seen).size).toBe(seen.length);
    const original = all.entries.map((e) => e.id).filter((id) => id <= (all.entries.at(0)?.id ?? 0));
    expect(seen).toEqual(expect.arrayContaining(original.slice(-5)));
  });

  it('entrega las acciones y tablas que existen, para llenar los filtros', async () => {
    const filters = auditFiltersResponseSchema.parse((await call('get', '/auditoria/filtros', ADMIN)).body);
    expect(filters.actions).toEqual(expect.arrayContaining(['LOGIN', 'INFANTE_REGISTRADO', 'INFANTE_ACTUALIZADO', 'TUTOR_ACTUALIZADO']));
    expect(filters.tables).toEqual(expect.arrayContaining(['infantes', 'tutores', 'sesiones']));
  });

  it('consultar la bitácora queda registrado, a nombre de quien la consultó, sin filtros ni resultados', async () => {
    await call('get', '/auditoria', ADMIN);
    const [row] = await rows<{ accion: string; usuario: string; rol: string; tabla: string }>(
      sql`SELECT a.accion AS accion, u.correo AS usuario, a.rol_codigo AS rol, a.tabla_afectada AS tabla FROM auditoria a JOIN usuarios u ON u.id = a.usuario_id WHERE a.accion = 'AUDITORIA_CONSULTADA' ORDER BY a.id DESC LIMIT 1`,
    );
    expect(row).toMatchObject({ accion: 'AUDITORIA_CONSULTADA', usuario: ADMIN, rol: 'ADMIN_CENTRAL', tabla: 'auditoria' });
  });
});
