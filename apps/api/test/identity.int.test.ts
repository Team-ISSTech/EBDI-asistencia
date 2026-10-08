import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { applyMigrations, connect, dropAllObjects, schema, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';

/**
 * Flujo completo contra MySQL real: migraciones + semilla + API con todos los
 * guards, filtros y middleware de producción. Se omite, con aviso, sin
 * TEST_DATABASE_URL; nunca toca DATABASE_URL.
 */
describe.skipIf(!TEST_DATABASE_URL)('identidad (integración)', () => {
  let app: INestApplication;

  const login = (email: string, password = SEED_PASSWORD) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  const cookieOf = (response: request.Response): string => {
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error('Sin cookie de sesión');
    return cookie.split(';')[0] ?? '';
  };

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['LOGIN_MAX_ATTEMPTS'] = '3';
    // La suite hace más de 10 logins por minuto. El límite real (429) se
    // comprueba en 'el límite de intentos por IP responde 429' con un umbral bajo
    // en una app aparte; aquí solo se sube para no bloquear las demás pruebas.
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '100';
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    const connection = connect(TEST_DATABASE_URL);
    await syncRolePermissions(connection.db);
    await seedDevelopmentData(connection.db, SEED_PASSWORD);
    await connection.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health reporta la base arriba', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('rechaza cuerpos inválidos con DATOS_INVALIDOS', async () => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email: 'x' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DATOS_INVALIDOS');
  });

  it('login de docente entrega cookie httpOnly y /auth/me devuelve permisos de la estancia', async () => {
    const response = await login('docente@sirai.test');
    expect(response.status).toBe(200);
    const cookie = cookieOf(response);
    const setCookie = response.get('set-cookie')?.[0] ?? '';
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).toMatch(/Max-Age=259200/);
    expect(setCookie).not.toMatch(/Secure/);
    expect(response.body.activeEstancia.name).toBe('Estancia de prueba 01');

    const me = await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.permissions.sort()).toEqual(['ASISTENCIA_CONSULTAR', 'ASISTENCIA_REGISTRAR']);
  });

  it('sin cookie responde 401 NO_AUTENTICADO', async () => {
    const response = await request(app.getHttpServer()).get('/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('docente no puede listar usuarios (403 SIN_PERMISO); admin central sí', async () => {
    const docente = cookieOf(await login('docente@sirai.test'));
    const forbidden = await request(app.getHttpServer()).get('/usuarios').set('Cookie', docente);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('SIN_PERMISO');

    const admin = cookieOf(await login('admin_central@sirai.test'));
    const allowed = await request(app.getHttpServer()).get('/usuarios').set('Cookie', admin);
    expect(allowed.status).toBe(200);
    expect(allowed.body.users).toHaveLength(7);
  });

  it('cambiar a una estancia no asignada responde 403 FUERA_DE_ALCANCE', async () => {
    const docente = cookieOf(await login('docente@sirai.test'));
    const response = await request(app.getHttpServer()).post('/auth/estancia').set('Cookie', docente).send({ estanciaId: 2 });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FUERA_DE_ALCANCE');
  });

  it('admin central crea un usuario y le reemplaza roles; ambos quedan auditados', async () => {
    const admin = cookieOf(await login('admin_central@sirai.test'));
    const created = await request(app.getHttpServer())
      .post('/usuarios')
      .set('Cookie', admin)
      .send({ name: 'Nueva Docente', email: 'nueva@sirai.test', temporaryPassword: 'Temporal-2026', assignments: [{ role: 'DOCENTE', estanciaId: 2 }] });
    expect(created.status).toBe(201);

    const replaced = await request(app.getHttpServer())
      .patch(`/usuarios/${created.body.id}/roles`)
      .set('Cookie', admin)
      .send({ assignments: [{ role: 'DIRECTORA', estanciaId: 2 }] });
    expect(replaced.status).toBe(200);
    expect(replaced.body.assignments).toEqual([{ role: 'DIRECTORA', estanciaId: 2 }]);

    const asNew = await login('nueva@sirai.test', 'Temporal-2026');
    expect(asNew.status).toBe(200);
    expect(asNew.body.permissions).toContain('JORNADA_CERRAR');

    const connection = connect(TEST_DATABASE_URL!);
    const rows = await connection.db.select({ action: schema.auditoria.action, ip: schema.auditoria.ipAddress }).from(schema.auditoria);
    await connection.close();
    const actions = rows.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['LOGIN', 'USUARIO_CREADO', 'ROLES_REEMPLAZADOS']));
    expect(rows.find((row) => row.action === 'USUARIO_CREADO')?.ip).toEqual(Buffer.from([127, 0, 0, 1]));
  });

  it('bloquea la cuenta tras los intentos fallidos configurados, incluso con intentos simultáneos', async () => {
    const attempt = () => login('medico@sirai.test', 'incorrecta');
    const results = await Promise.all([attempt(), attempt(), attempt()]);
    expect(results.map((r) => r.body.error.code)).toEqual(['CREDENCIALES_INVALIDAS', 'CREDENCIALES_INVALIDAS', 'CREDENCIALES_INVALIDAS']);
    const correct = await login('medico@sirai.test');
    expect(correct.status).toBe(401);
    expect(correct.body.error.code).toBe('CUENTA_BLOQUEADA');
  });

  it('crear un usuario con un correo existente responde 409 CONFLICTO', async () => {
    const admin = cookieOf(await login('admin_central@sirai.test'));
    const response = await request(app.getHttpServer())
      .post('/usuarios')
      .set('Cookie', admin)
      .send({ name: 'Repetida', email: 'docente@sirai.test', temporaryPassword: 'Temporal-2026', assignments: [] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICTO');
  });

  it('el límite de intentos por IP responde 429 DEMASIADAS_SOLICITUDES', async () => {
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '2';
    const limited = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    configureApp(limited);
    await limited.init();
    try {
      const attempt = () => request(limited.getHttpServer()).post('/auth/login').send({ email: 'x@sirai.test', password: 'y' });
      await attempt();
      await attempt();
      const third = await attempt();
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('DEMASIADAS_SOLICITUDES');
    } finally {
      await limited.close();
      process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '100';
    }
  });

  it('logout revoca la cookie', async () => {
    const cookie = cookieOf(await login('directora@sirai.test'));
    const logout = await request(app.getHttpServer()).post('/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(logout.get('set-cookie')?.[0]).toMatch(/sirai_session=;.*Expires=Thu, 01 Jan 1970/);
    const me = await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });
});
