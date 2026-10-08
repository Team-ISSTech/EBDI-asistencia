import { resolve } from 'node:path';
import { count, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type DbConnection } from '../client.js';
import { applyMigrations, dropAllObjects } from '../migrate/runner.js';
import { expectedRolePermissionPairs, syncRolePermissions } from '../seed/catalog.js';
import { DEV_ESTANCIAS, devUserEmail, seedDevelopmentData } from '../seed/dev.js';
import { auditoria, permisos, rolPermiso, roles, usuarioRol, usuarios } from '../schema/index.js';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(import.meta.dirname, '../../sql');

/**
 * Pruebas de integración contra MySQL/MariaDB real. Se omiten, con aviso,
 * cuando no hay TEST_DATABASE_URL; nunca usan DATABASE_URL para no borrar
 * datos de desarrollo.
 */
describe.skipIf(!TEST_DATABASE_URL)('migraciones y semilla (integración)', () => {
  let connection: DbConnection;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    await dropAllObjects(TEST_DATABASE_URL);
    connection = connect(TEST_DATABASE_URL);
  });

  afterAll(async () => {
    await connection?.close();
  });

  it('aplica todas las migraciones una sola vez', async () => {
    const first = await applyMigrations(TEST_DATABASE_URL!, SQL_DIR);
    expect(first.applied).toEqual(['0000_esquema_equipo.sql', '0001_sesiones.sql', '0002_auditoria_inmutable.sql']);
    const second = await applyMigrations(TEST_DATABASE_URL!, SQL_DIR);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toHaveLength(3);
  });

  it('deja los catálogos de roles y permisos sembrados por el SQL del equipo', async () => {
    const roleRows = await connection.db.select().from(roles);
    const permissionRows = await connection.db.select().from(permisos);
    expect(roleRows).toHaveLength(7);
    expect(permissionRows).toHaveLength(10);
  });

  it('sincroniza rol_permiso con la matriz y es idempotente', async () => {
    const first = await syncRolePermissions(connection.db);
    expect(first.inserted).toBe(expectedRolePermissionPairs().length);
    const second = await syncRolePermissions(connection.db);
    expect(second).toEqual({ inserted: 0, removed: 0 });
    const rows = await connection.db.select().from(rolPermiso);
    expect(rows).toHaveLength(expectedRolePermissionPairs().length);
  });

  it('elimina pares que no están en la matriz', async () => {
    await connection.db.execute(sql`INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p
      WHERE r.codigo = 'DOCENTE' AND p.codigo = 'USUARIO_ADMINISTRAR'`);
    const report = await syncRolePermissions(connection.db);
    expect(report).toEqual({ inserted: 0, removed: 1 });
  });

  it('la bitácora rechaza UPDATE y DELETE en el motor', async () => {
    // Drizzle envuelve el error del motor; el mensaje del trigger viene en `cause`.
    const rootMessage = (error: unknown): string =>
      error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error);
    await connection.db.execute(sql`INSERT INTO auditoria (accion, tabla_afectada) VALUES ('PRUEBA', 'x')`);
    await expect(connection.db.execute(sql`UPDATE auditoria SET accion = 'ALTERADA'`).catch((e: unknown) => Promise.reject(rootMessage(e)))).rejects.toMatch(/inmutable/);
    await expect(connection.db.execute(sql`DELETE FROM auditoria`).catch((e: unknown) => Promise.reject(rootMessage(e)))).rejects.toMatch(/inmutable/);
    const [row] = await connection.db.select({ n: count() }).from(auditoria);
    expect(row?.n).toBe(1);
  });

  it('siembra estancias y un usuario por rol, de forma repetible', async () => {
    const first = await seedDevelopmentData(connection.db, 'contrasena-de-prueba');
    expect(first.users).toContain(devUserEmail('DOCENTE'));
    await seedDevelopmentData(connection.db, 'contrasena-de-prueba');
    const users = await connection.db.select().from(usuarios);
    const assignments = await connection.db.select().from(usuarioRol);
    expect(users).toHaveLength(7);
    expect(assignments).toHaveLength(7);
    const central = assignments.filter((row) => row.estanciaId === null);
    expect(central).toHaveLength(2);
    expect(DEV_ESTANCIAS).toHaveLength(2);
  });
});
