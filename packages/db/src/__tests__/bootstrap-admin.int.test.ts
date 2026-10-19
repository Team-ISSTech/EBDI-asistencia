import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type DbConnection } from '../client.js';
import { applyMigrations, dropAllObjects } from '../migrate/runner.js';
import { bootstrapAdmin } from '../seed/bootstrap-admin.js';
import { auditoria, roles, usuarioRol, usuarios } from '../schema/index.js';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(import.meta.dirname, '../../sql');
const now = new Date('2026-10-20T12:00:00Z');
const input = { email: 'admin@institucion.gob.mx', name: 'Ana Admin', passwordHash: 'hash-de-prueba', passwordExpiresAt: new Date('2026-10-27T12:00:00Z'), now };

/** El primer administrador de un despliegue nuevo: la semilla de desarrollo no corre en producción. */
describe.skipIf(!TEST_DATABASE_URL)('primer administrador (integración)', () => {
  let connection: DbConnection;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    connection = connect(TEST_DATABASE_URL);
  });

  afterAll(async () => {
    await connection?.close();
  });

  it('crea la cuenta con contraseña temporal, rol de administrador central sin estancia y rastro en la bitácora', async () => {
    const { userId } = await bootstrapAdmin(connection.db, input);
    const [user] = await connection.db.select().from(usuarios).where(eq(usuarios.id, userId));
    expect(user).toMatchObject({ email: input.email, name: input.name, passwordHash: 'hash-de-prueba', mustChangePassword: true, status: 'ACTIVO' });
    expect(user?.temporaryPasswordExpiresAt).toEqual(input.passwordExpiresAt);
    const assignments = await connection.db.select({ role: roles.code, estanciaId: usuarioRol.estanciaId }).from(usuarioRol).innerJoin(roles, eq(roles.id, usuarioRol.roleId)).where(eq(usuarioRol.userId, userId));
    expect(assignments).toEqual([{ role: 'ADMIN_CENTRAL', estanciaId: null }]);
    const [entry] = await connection.db.select().from(auditoria).where(eq(auditoria.recordId, String(userId)));
    expect(entry).toMatchObject({ action: 'USUARIO_CREADO', roleCode: 'SISTEMA', tableName: 'usuarios', userId: null, userAgent: 'cli:crear-admin' });
  });

  it('solo sirve una vez: con un administrador ya creado se niega, para no ser una puerta trasera', async () => {
    await expect(bootstrapAdmin(connection.db, { ...input, email: 'otro@institucion.gob.mx' })).rejects.toThrow(/ya existe un administrador/i);
    const rows = await connection.db.select({ id: usuarios.id }).from(usuarios);
    expect(rows).toHaveLength(1);
  });
});
