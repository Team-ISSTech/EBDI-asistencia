import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sessionResponseSchema } from '@sirai/contracts';
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
const TEMP = 'Temporal-2026';
const FINAL = 'Definitiva-2026-x';

/** Contraseña temporal, cambio obligatorio y voluntario, y restablecimiento (RF-38) contra MySQL real. */
describe.skipIf(!TEST_DATABASE_URL)('cambio de contraseña (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let counter = 0;

  const server = () => request(app.getHttpServer());
  const login = (email: string, password: string) => server().post('/auth/login').send({ email, password });
  const cookieOf = (response: request.Response): string => {
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error('Sin cookie de sesión');
    return cookie.split(';')[0] ?? '';
  };
  const cookieFor = async (email: string, password = SEED_PASSWORD) => cookieOf(await login(email, password));
  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];

  /** Crea un usuario con contraseña temporal y devuelve su correo e id. */
  const newUser = async (role = 'DOCENTE'): Promise<{ email: string; id: number }> => {
    counter += 1;
    const email = `temporal${counter}@sirai.test`;
    const admin = await cookieFor(ADMIN);
    const created = await server()
      .post('/usuarios')
      .set('Cookie', admin)
      .send({ name: `Usuario ${counter}`, email, temporaryPassword: TEMP, assignments: [{ role, estanciaId: 1 }] });
    expect(created.status).toBe(201);
    return { email, id: created.body.id };
  };

  const change = (cookie: string, currentPassword: string, newPassword: string) => server().post('/auth/contrasena').set('Cookie', cookie).send({ currentPassword, newPassword });

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['LOGIN_MAX_ATTEMPTS'] = '3';
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
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('un usuario nuevo entra con la temporal, pero solo puede ver su sesión, cambiar la contraseña y salir', async () => {
    const user = await newUser();
    const response = await login(user.email, TEMP);
    expect(response.status).toBe(200);
    expect(sessionResponseSchema.parse(response.body)).toMatchObject({ mustChangePassword: true, permissions: [] });
    const cookie = cookieOf(response);

    expect((await server().get('/auth/me').set('Cookie', cookie)).body.mustChangePassword).toBe(true);
    for (const path of ['/infantes', '/salas', '/asistencia/jornadas/activa?date=2026-10-18&shift=MATUTINO']) {
      const blocked = await server().get(path).set('Cookie', cookie);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('CAMBIO_CONTRASENA_REQUERIDO');
    }
    expect((await server().post('/auth/logout').set('Cookie', cookie)).status).toBe(204);
  });

  it('la nueva contraseña cumple la política: corta, igual a la actual o con la actual mal se rechazan', async () => {
    const user = await newUser();
    const cookie = cookieOf(await login(user.email, TEMP));
    expect((await change(cookie, TEMP, 'corta')).status).toBe(400);
    expect((await change(cookie, TEMP, TEMP)).status).toBe(400);
    const wrong = await change(cookie, 'incorrecta-123', FINAL);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('La contraseña actual es incorrecta.');
    expect((await login(user.email, TEMP)).status).toBe(200);
  });

  it('al cambiarla se libera la sesión, desaparecen la marca y la caducidad, y la anterior deja de servir', async () => {
    const user = await newUser();
    const cookie = cookieOf(await login(user.email, TEMP));
    const changed = await change(cookie, TEMP, FINAL);
    expect(changed.status).toBe(200);
    expect(sessionResponseSchema.parse(changed.body)).toMatchObject({ mustChangePassword: false });
    expect(changed.body.permissions.length).toBeGreaterThan(0);

    expect((await server().get('/infantes').set('Cookie', cookie)).status).toBe(200);
    const [row] = await rows<{ debe: number; expira: Date | null; cambiado: Date | null }>(
      sql`SELECT debe_cambiar_password AS debe, password_temporal_expira_at AS expira, password_cambiado_at AS cambiado FROM usuarios WHERE id = ${user.id}`,
    );
    expect(Number(row?.debe)).toBe(0);
    expect(row?.expira).toBeNull();
    expect(row?.cambiado).not.toBeNull();
    expect((await login(user.email, TEMP)).status).toBe(401);
    expect((await login(user.email, FINAL)).status).toBe(200);
  });

  it('cambiar la contraseña cierra las demás sesiones, no la actual', async () => {
    const user = await newUser();
    const first = cookieOf(await login(user.email, TEMP));
    const second = cookieOf(await login(user.email, TEMP));
    expect((await change(first, TEMP, FINAL)).status).toBe(200);
    expect((await server().get('/auth/me').set('Cookie', first)).status).toBe(200);
    expect((await server().get('/auth/me').set('Cookie', second)).status).toBe(401);
  });

  it('cualquier persona puede cambiarla después, sin ser temporal', async () => {
    const cookie = await cookieFor('docente@sirai.test');
    expect((await change(cookie, SEED_PASSWORD, 'otra-clave-larga-1')).status).toBe(200);
    expect((await login('docente@sirai.test', SEED_PASSWORD)).status).toBe(401);
    expect((await login('docente@sirai.test', 'otra-clave-larga-1')).status).toBe(200);
    const audited = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'CONTRASENA_CAMBIADA' AND registro_id = (SELECT CAST(id AS CHAR) FROM usuarios WHERE correo = 'docente@sirai.test')`);
    expect(Number(audited[0]?.n)).toBe(1);
  });

  it('los intentos fallidos al cambiarla bloquean la cuenta', async () => {
    const user = await newUser();
    const cookie = cookieOf(await login(user.email, TEMP));
    for (let i = 0; i < 3; i += 1) await change(cookie, 'mala-clave-123', FINAL);
    const locked = await change(cookie, TEMP, FINAL);
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe('CUENTA_BLOQUEADA');
  });

  it('una temporal caducada no entra; quien no la conoce no se entera; el administrador la restablece y desbloquea', async () => {
    const user = await newUser();
    await connection.db.execute(sql`UPDATE usuarios SET password_temporal_expira_at = DATE_SUB(NOW(6), INTERVAL 1 MINUTE) WHERE id = ${user.id}`);
    const expired = await login(user.email, TEMP);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('CONTRASENA_TEMPORAL_CADUCADA');
    expect((await login(user.email, 'incorrecta-123')).body.error.code).toBe('CREDENCIALES_INVALIDAS');

    const admin = await cookieFor(ADMIN);
    const reset = await server().post(`/usuarios/${user.id}/contrasena-temporal`).set('Cookie', admin).send({ temporaryPassword: 'Restablecida-2026' });
    expect(reset.status).toBe(201);
    expect(JSON.stringify(reset.body)).not.toContain('Restablecida');
    const entered = await login(user.email, 'Restablecida-2026');
    expect(entered.status).toBe(200);
    expect(entered.body.mustChangePassword).toBe(true);
    expect((await login(user.email, TEMP)).status).toBe(401);
  });

  it('restablecer cierra las sesiones abiertas y levanta el bloqueo', async () => {
    const user = await newUser();
    await change(cookieOf(await login(user.email, TEMP)), TEMP, FINAL);
    const open = cookieOf(await login(user.email, FINAL));
    for (let i = 0; i < 3; i += 1) await login(user.email, 'mala-clave-123');
    expect((await login(user.email, FINAL)).body.error.code).toBe('CUENTA_BLOQUEADA');

    const admin = await cookieFor(ADMIN);
    await server().post(`/usuarios/${user.id}/contrasena-temporal`).set('Cookie', admin).send({ temporaryPassword: 'Restablecida-2026' });
    expect((await server().get('/auth/me').set('Cookie', open)).status).toBe(401);
    expect((await login(user.email, 'Restablecida-2026')).status).toBe(200);
  });

  it('solo el administrador restablece, no a sí mismo ni a quien no existe, y queda auditado', async () => {
    const user = await newUser();
    const body = { temporaryPassword: 'Restablecida-2026' };
    const directora = await cookieFor('directora@sirai.test');
    expect((await server().post(`/usuarios/${user.id}/contrasena-temporal`).set('Cookie', directora).send(body)).status).toBe(403);
    const admin = await cookieFor(ADMIN);
    const [self] = await rows<{ id: number }>(sql`SELECT id FROM usuarios WHERE correo = ${ADMIN}`);
    expect((await server().post(`/usuarios/${self?.id}/contrasena-temporal`).set('Cookie', admin).send(body)).status).toBe(403);
    expect((await server().post('/usuarios/99999/contrasena-temporal').set('Cookie', admin).send(body)).status).toBe(404);
    expect((await server().post(`/usuarios/${user.id}/contrasena-temporal`).set('Cookie', admin).send({ temporaryPassword: 'corta' })).status).toBe(400);
    expect((await server().post(`/usuarios/${user.id}/contrasena-temporal`).set('Cookie', admin).send(body)).status).toBe(201);
    const actions = await rows<{ accion: string }>(sql`SELECT DISTINCT accion FROM auditoria`);
    expect(actions.map((a) => a.accion)).toEqual(expect.arrayContaining(['CONTRASENA_CAMBIADA', 'CONTRASENA_RESTABLECIDA']));
  });
});
