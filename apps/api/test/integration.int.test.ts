import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createdSystemResponseSchema, dashboardResponseSchema, integrationTokenResponseSchema, systemListResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const ADMIN = 'admin_central@sirai.test';
const today = new Date().toISOString().slice(0, 10);
const API_TOKEN_SECRET = 'integration-test-secret-'.padEnd(40, 'x');

/** Sistemas externos con Bearer token (RF-37) contra MySQL real: alta, token, alcance, revocación y separación de mundos. */
describe.skipIf(!TEST_DATABASE_URL)('API con Bearer tokens (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;

  const server = () => request(app.getHttpServer());
  const cookieFor = async (email: string): Promise<string> => {
    const response = await server().post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error(`Sin cookie para ${email}`);
    return cookie.split(';')[0] ?? '';
  };
  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];

  /** Registra un sistema como administrador y devuelve sus credenciales. */
  const register = async (name = 'Tablero institucional', scopes: string[] = ['REPORTE_AGREGADO_LEER']) => {
    const admin = await cookieFor(ADMIN);
    const response = await server().post('/administracion/sistemas').set('Cookie', admin).send({ name, scopes });
    expect(response.status).toBe(201);
    return createdSystemResponseSchema.parse(response.body);
  };
  const tokenFor = async (clientId: string, clientSecret: string) => server().post('/integracion/token').send({ clientId, clientSecret });
  const bearer = async (system: { system: { clientId: string }; clientSecret: string }): Promise<string> =>
    integrationTokenResponseSchema.parse((await tokenFor(system.system.clientId, system.clientSecret)).body).accessToken;
  const tablero = (token: string) => server().get(`/integracion/tablero?date=${today}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['API_TOKEN_SECRET'] = API_TOKEN_SECRET;
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '500';
    process.env['INTEGRATION_RATE_LIMIT_PER_MINUTE'] = '1000';
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

  it('solo el administrador central registra, consulta y revoca sistemas', async () => {
    for (const email of ['directora@sirai.test', 'docente@sirai.test', 'trabajo_social@sirai.test', 'medico@sirai.test', 'supervisor_central@sirai.test']) {
      const cookie = await cookieFor(email);
      expect((await server().get('/administracion/sistemas').set('Cookie', cookie)).status).toBe(403);
      expect((await server().post('/administracion/sistemas').set('Cookie', cookie).send({ name: 'X', scopes: ['REPORTE_AGREGADO_LEER'] })).status).toBe(403);
    }
  });

  it('el secreto sale al registrar y en ningún otro lugar; en la base solo hay su hash', async () => {
    const created = await register('Sistema A');
    expect(created.clientSecret).toMatch(/^sirai_/);
    expect(created.system.clientId).toMatch(/^[0-9a-f]{32}$/);
    const admin = await cookieFor(ADMIN);
    const list = await server().get('/administracion/sistemas').set('Cookie', admin);
    expect(systemListResponseSchema.parse(list.body).systems.some((s) => s.clientId === created.system.clientId)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain(created.clientSecret);
    const [row] = await rows<{ hash: string }>(sql`SELECT secret_hash AS hash FROM sistemas_integracion WHERE id = ${created.system.id}`);
    expect(row?.hash).toMatch(/^\$argon2id\$/);
    expect(row?.hash).not.toContain(created.clientSecret);
  });

  it('rechaza alcances inventados, un permiso de persona como alcance y un cuerpo vacío', async () => {
    const admin = await cookieFor(ADMIN);
    for (const body of [{ name: 'X', scopes: ['TODO'] }, { name: 'X', scopes: ['REPORTE_AGREGADO_CONSULTAR'] }, { name: 'X', scopes: [] }, {}]) {
      expect((await server().post('/administracion/sistemas').set('Cookie', admin).send(body)).status).toBe(400);
    }
  });

  it('con las credenciales correctas entrega un Bearer; con secreto malo, clientId desconocido o revocado responde lo mismo', async () => {
    const system = await register('Sistema B');
    const ok = await tokenFor(system.system.clientId, system.clientSecret);
    expect(ok.status).toBe(200);
    expect(integrationTokenResponseSchema.parse(ok.body)).toMatchObject({ tokenType: 'Bearer', scope: 'REPORTE_AGREGADO_LEER', expiresIn: 900 });

    const bad = await tokenFor(system.system.clientId, 'incorrecto');
    const unknown = await tokenFor('a'.repeat(32), system.clientSecret);
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body).toEqual(unknown.body);
    expect(bad.body.error.code).toBe('CREDENCIALES_INVALIDAS');
    expect((await tokenFor('no-es-hex', 'x')).status).toBe(400);
  });

  it('el token da acceso al tablero agregado, sin ningún dato identificable de menores', async () => {
    const system = await register('Sistema C');
    const response = await tablero(await bearer(system));
    expect(response.status).toBe(200);
    expect(dashboardResponseSchema.parse(response.body).estancias.length).toBeGreaterThan(0);
    expect(JSON.stringify(response.body)).not.toMatch(/matricula|enrollmentNumber|curp|telefono|paternalSurname/i);
  });

  it('sin token, con un token malo, vencido, alterado o con `alg: none` responde 401', async () => {
    const system = await register('Sistema D');
    const token = await bearer(system);
    expect((await server().get(`/integracion/tablero?date=${today}`)).status).toBe(401);
    expect((await tablero('no-es-un-token')).status).toBe(401);
    const [head, body, signature] = token.split('.');
    expect((await tablero(`${head}.${body}.${signature?.slice(0, -2)}xx`)).status).toBe(401);

    const key = new TextEncoder().encode(API_TOKEN_SECRET);
    const expired = await new SignJWT({ scope: 'REPORTE_AGREGADO_LEER' })
      .setProtectedHeader({ alg: 'HS256', kid: 'v1' })
      .setSubject(String(system.system.id))
      .setIssuer('sirai')
      .setAudience('sirai-integracion')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    expect((await tablero(expired)).status).toBe(401);
    const claims = Buffer.from(JSON.stringify({ sub: String(system.system.id), scope: 'REPORTE_AGREGADO_LEER', iss: 'sirai', aud: 'sirai-integracion', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${claims}.`;
    expect((await tablero(none)).status).toBe(401);
  });

  it('un token firmado con otra llave no sirve, aunque diga ser un sistema real', async () => {
    const system = await register('Sistema E');
    const forged = await new SignJWT({ scope: 'REPORTE_AGREGADO_LEER' })
      .setProtectedHeader({ alg: 'HS256', kid: 'v1' })
      .setSubject(String(system.system.id))
      .setIssuer('sirai')
      .setAudience('sirai-integracion')
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(new TextEncoder().encode('otra-llave-'.padEnd(40, 'y')));
    expect((await tablero(forged)).status).toBe(401);
  });

  it('un token no concede alcances que el sistema no tiene registrados, y un sistema sin el alcance recibe 403', async () => {
    const system = await register('Sistema F');
    const token = await bearer(system);
    await connection.db.execute(sql`UPDATE sistemas_integracion SET alcances = 'ALCANCE_DESCONOCIDO' WHERE id = ${system.system.id}`);
    const response = await tablero(token);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SIN_PERMISO');
  });

  it('revocar el sistema invalida su token al instante y no emite más', async () => {
    const system = await register('Sistema G');
    const token = await bearer(system);
    expect((await tablero(token)).status).toBe(200);
    const admin = await cookieFor(ADMIN);
    expect((await server().post(`/administracion/sistemas/${system.system.id}/revocar`).set('Cookie', admin)).status).toBe(204);
    expect((await tablero(token)).status).toBe(401);
    expect((await tokenFor(system.system.clientId, system.clientSecret)).status).toBe(401);
    expect((await server().post(`/administracion/sistemas/${system.system.id}/revocar`).set('Cookie', admin)).status).toBe(409);
    expect((await server().post('/administracion/sistemas/99999/revocar').set('Cookie', admin)).status).toBe(404);
    const [row] = await rows<{ estatus: string; revocado: number; por: number | null }>(sql`SELECT estatus, (revocado_at IS NOT NULL) AS revocado, revocado_por AS por FROM sistemas_integracion WHERE id = ${system.system.id}`);
    expect(row).toMatchObject({ estatus: 'REVOCADO' });
    expect(Number(row?.revocado)).toBe(1);
    expect(row?.por).not.toBeNull();
  });

  it('el Bearer de un sistema no abre ninguna ruta de personas, ni siquiera las que solo piden sesión', async () => {
    const token = await bearer(await register('Sistema H'));
    for (const path of ['/auth/me', '/reportes/tablero?date=' + today, '/infantes', '/usuarios', '/administracion/sistemas', '/auditoria']) {
      expect((await server().get(path).set('Authorization', `Bearer ${token}`)).status, path).toBe(401);
    }
  });

  it('la cookie de una persona, ni siquiera la del administrador, abre la API de integración', async () => {
    const admin = await cookieFor(ADMIN);
    expect((await server().get(`/integracion/tablero?date=${today}`).set('Cookie', admin)).status).toBe(401);
  });

  it('audita el alta, cada token emitido (y los intentos fallidos), cada consulta y la revocación, a nombre del sistema', async () => {
    const actions = await rows<{ accion: string; sistema: number | null; usuario: number | null }>(
      sql`SELECT accion, sistema_id AS sistema, usuario_id AS usuario FROM auditoria WHERE accion LIKE 'SISTEMA_%' ORDER BY id`,
    );
    const names = actions.map((a) => a.accion);
    expect(names).toEqual(expect.arrayContaining(['SISTEMA_REGISTRADO', 'SISTEMA_TOKEN_EMITIDO', 'SISTEMA_TOKEN_FALLIDO', 'SISTEMA_CONSULTA', 'SISTEMA_REVOCADO']));
    for (const entry of actions.filter((a) => ['SISTEMA_TOKEN_EMITIDO', 'SISTEMA_TOKEN_FALLIDO', 'SISTEMA_CONSULTA'].includes(a.accion))) {
      expect(entry.sistema).not.toBeNull();
      expect(entry.usuario).toBeNull();
    }
  });

  it('limita las peticiones por minuto de cada sistema con 429', async () => {
    process.env['INTEGRATION_RATE_LIMIT_PER_MINUTE'] = '3';
    const limited = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    configureApp(limited);
    await limited.init();
    try {
      const system = await register('Sistema I');
      const issued = await request(limited.getHttpServer()).post('/integracion/token').send({ clientId: system.system.clientId, clientSecret: system.clientSecret });
      const token = integrationTokenResponseSchema.parse(issued.body).accessToken;
      const call = () => request(limited.getHttpServer()).get(`/integracion/tablero?date=${today}`).set('Authorization', `Bearer ${token}`);
      expect([(await call()).status, (await call()).status, (await call()).status]).toEqual([200, 200, 200]);
      const over = await call();
      expect(over.status).toBe(429);
      expect(over.body.error.code).toBe('DEMASIADAS_SOLICITUDES');
    } finally {
      await limited.close();
      process.env['INTEGRATION_RATE_LIMIT_PER_MINUTE'] = '1000';
    }
  });
});
