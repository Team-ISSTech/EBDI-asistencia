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
const ADMIN = 'admin_central@sirai.test';
const FINAL = 'Definitiva-2026-x';

/** Baja lógica de usuarios (RNF-04) contra MySQL real. */
describe.skipIf(!TEST_DATABASE_URL)('baja de usuarios (integración)', () => {
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
  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];

  /** Crea un usuario, le quita la contraseña temporal y devuelve su correo, id y una sesión abierta. */
  const newUser = async () => {
    counter += 1;
    const email = `baja${counter}@sirai.test`;
    const admin = cookieOf(await login(ADMIN, SEED_PASSWORD));
    const created = await server().post('/usuarios').set('Cookie', admin).send({ name: `Persona ${counter}`, email, temporaryPassword: 'Temporal-2026', assignments: [{ role: 'DOCENTE', estanciaId: 1 }] });
    const first = cookieOf(await login(email, 'Temporal-2026'));
    await server().post('/auth/contrasena').set('Cookie', first).send({ currentPassword: 'Temporal-2026', newPassword: FINAL });
    return { email, id: created.body.id as number, cookie: first };
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
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo el administrador central da de baja usuarios', async () => {
    const user = await newUser();
    for (const email of ['directora@sirai.test', 'docente@sirai.test', 'supervisor_central@sirai.test']) {
      const cookie = cookieOf(await login(email, SEED_PASSWORD));
      expect((await server().post(`/usuarios/${user.id}/baja`).set('Cookie', cookie)).status).toBe(403);
    }
  });

  it('marca el borrado lógico atribuido, deja la cuenta inactiva y conserva sus asignaciones y su rastro', async () => {
    const user = await newUser();
    const admin = cookieOf(await login(ADMIN, SEED_PASSWORD));
    expect((await server().post(`/usuarios/${user.id}/baja`).set('Cookie', admin)).status).toBe(204);
    const [row] = await rows<{ borrado: number; por: number | null; estatus: string }>(sql`SELECT (deleted_at IS NOT NULL) AS borrado, deleted_by AS por, estatus FROM usuarios WHERE id = ${user.id}`);
    expect(Number(row?.borrado)).toBe(1);
    expect(row?.por).not.toBeNull();
    expect(row?.estatus).toBe('INACTIVO');
    const [assignments] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM usuario_rol WHERE usuario_id = ${user.id}`);
    expect(Number(assignments?.n)).toBeGreaterThan(0);
    const [trail] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM auditoria WHERE usuario_id = ${user.id}`);
    expect(Number(trail?.n)).toBeGreaterThan(0);
  });

  it('su sesión abierta deja de servir al instante, no puede volver a entrar y desaparece de la lista', async () => {
    const user = await newUser();
    expect((await server().get('/auth/me').set('Cookie', user.cookie)).status).toBe(200);
    const admin = cookieOf(await login(ADMIN, SEED_PASSWORD));
    await server().post(`/usuarios/${user.id}/baja`).set('Cookie', admin);
    expect((await server().get('/auth/me').set('Cookie', user.cookie)).status).toBe(401);
    const retried = await login(user.email, FINAL);
    expect(retried.status).toBe(401);
    expect(retried.body.error.code).toBe('CREDENCIALES_INVALIDAS');
    const list = await server().get('/usuarios').set('Cookie', admin);
    expect((list.body.users as { id: number }[]).some((u) => u.id === user.id)).toBe(false);
    const [sessions] = await rows<{ activas: number }>(sql`SELECT COUNT(*) AS activas FROM sesiones WHERE usuario_id = ${user.id} AND revocada_at IS NULL`);
    expect(Number(sessions?.activas)).toBe(0);
  });

  it('el correo de una cuenta dada de baja no se reutiliza, y dar de baja dos veces o a quien no existe responde 404', async () => {
    const user = await newUser();
    const admin = cookieOf(await login(ADMIN, SEED_PASSWORD));
    await server().post(`/usuarios/${user.id}/baja`).set('Cookie', admin);
    expect((await server().post(`/usuarios/${user.id}/baja`).set('Cookie', admin)).status).toBe(404);
    expect((await server().post('/usuarios/99999/baja').set('Cookie', admin)).status).toBe(404);
    const again = await server().post('/usuarios').set('Cookie', admin).send({ name: 'Otra', email: user.email, temporaryPassword: 'Temporal-2026', assignments: [] });
    expect(again.status).toBe(409);
  });

  it('nadie se da de baja a sí mismo', async () => {
    const admin = cookieOf(await login(ADMIN, SEED_PASSWORD));
    const [self] = await rows<{ id: number }>(sql`SELECT id FROM usuarios WHERE correo = ${ADMIN}`);
    const response = await server().post(`/usuarios/${self?.id}/baja`).set('Cookie', admin);
    expect(response.status).toBe(403);
    expect((await server().get('/auth/me').set('Cookie', admin)).status).toBe(200);
  });

  it('queda en la bitácora con quién lo hizo', async () => {
    const user = await newUser();
    const admin = cookieOf(await login(ADMIN, SEED_PASSWORD));
    await server().post(`/usuarios/${user.id}/baja`).set('Cookie', admin);
    const [entry] = await rows<{ accion: string; rol: string; registro: string }>(
      sql`SELECT accion, rol_codigo AS rol, registro_id AS registro FROM auditoria WHERE accion = 'USUARIO_DADO_DE_BAJA' ORDER BY id DESC LIMIT 1`,
    );
    expect(entry).toMatchObject({ accion: 'USUARIO_DADO_DE_BAJA', rol: 'ADMIN_CENTRAL', registro: String(user.id) });
  });
});
