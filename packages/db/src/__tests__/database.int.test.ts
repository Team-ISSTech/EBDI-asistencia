import { resolve } from 'node:path';
import { count, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type DbConnection } from '../client.js';
import { applyMigrations, dropAllObjects } from '../migrate/runner.js';
import { expectedRolePermissionPairs, syncRolePermissions } from '../seed/catalog.js';
import { DEV_ESTANCIAS, DEV_ROOMS, devUserEmail, seedDevelopmentData } from '../seed/dev.js';
import { auditoria, children, ciclosEscolares, guardians, permisos, rooms, rolPermiso, roles, usuarioRol, usuarios } from '../schema/index.js';

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
    expect(first.applied).toEqual(['0000_esquema_equipo.sql', '0001_sesiones.sql', '0002_auditoria_inmutable.sql', '0003_ajustes_catalogos.sql', '0004_checks_catalogos.sql', '0005_permisos_padron.sql', '0006_checks_consentimientos.sql', '0007_checks_asistencia.sql', '0008_checks_seguimientos.sql', '0009_checks_contactos.sql', '0010_expedientes.sql', '0011_sincronizacion.sql', '0012_permisos_catalogo.sql', '0013_borrado_logico_vinculos.sql', '0014_cambio_contrasena.sql', '0015_sistemas_integracion.sql', '0016_retencion_ciclos.sql', '0017_avisos_emergencia.sql', '0018_salida_incidencias.sql']);
    const second = await applyMigrations(TEST_DATABASE_URL!, SQL_DIR);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toHaveLength(19);
  });

  it('deja los catálogos de roles y permisos sembrados por el SQL del equipo', async () => {
    const roleRows = await connection.db.select().from(roles);
    const permissionRows = await connection.db.select().from(permisos);
    expect(roleRows).toHaveLength(7);
    expect(permissionRows).toHaveLength(18);
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

  it('aplica los ajustes de catálogos: deleted_by, región, ciclos y discapacidad cifrada', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const [rows] = (await connection.db.execute(
        sql`SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`,
      )) as unknown as [{ name: string }[]];
      return rows.map((row) => row.name);
    };
    expect(await columnsOf('estancias')).toContain('deleted_by');
    expect(await columnsOf('contactos_seguimiento')).toContain('deleted_by');
    expect(await columnsOf('usuario_rol')).toContain('region');
    expect(await columnsOf('infantes')).toEqual(expect.arrayContaining(['grupo_discapacidad_cifrado']));
    expect(await columnsOf('infantes')).not.toContain('grupo_discapacidad');
    expect(await columnsOf('inscripciones')).toContain('ciclo_escolar_id');
    expect(await columnsOf('jornadas_asistencia')).toContain('ciclo_escolar_id');
  });

  it('rechaza ciclos con estado inválido o fechas invertidas', async () => {
    const insert = (code: string, start: string, end: string, status: string) =>
      connection.db.execute(
        sql`INSERT INTO ciclos_escolares (codigo, fecha_inicio, fecha_fin, estado) VALUES (${code}, ${start}, ${end}, ${status})`,
      );
    await expect(insert('2026-2027', '2026-08-24', '2027-07-16', 'ABIERTO')).rejects.toThrow();
    await expect(insert('2026-2027', '2027-07-16', '2026-08-24', 'ACTIVO')).rejects.toThrow();
    await expect(insert('2026-2027', '2026-08-24', '2027-07-16', 'ACTIVO')).resolves.toBeDefined();
  });

  it('rechaza en el motor turnos y estatus fuera del catálogo', async () => {
    await connection.db.execute(sql`INSERT INTO estancias (clave_ebdi, nombre) VALUES ('CHK-01', 'Estancia CHECK')`);
    const [estancia] = (await connection.db.execute(sql`SELECT id FROM estancias WHERE clave_ebdi = 'CHK-01'`)) as unknown as [{ id: number }[]];
    const estanciaId = estancia[0]?.id;
    const room = (shift: string, status: string) =>
      connection.db.execute(sql`INSERT INTO salas_grupos (estancia_id, nombre, turno, estatus) VALUES (${estanciaId}, ${`S-${shift}-${status}`}, ${shift}, ${status})`);
    await expect(room('NOCTURNO', 'ACTIVO')).rejects.toThrow();
    await expect(room('MATUTINO', 'CERRADO')).rejects.toThrow();
    await expect(room('MATUTINO', 'ACTIVO')).resolves.toBeDefined();
  });

  it('solo una contraseña temporal puede tener fecha de caducidad (RF-38)', async () => {
    const user = (email: string, mustChange: number, expiresAt: string | null) =>
      connection.db.execute(
        sql`INSERT INTO usuarios (correo, nombre, password_hash, debe_cambiar_password, password_temporal_expira_at, created_at, updated_at) VALUES (${email}, 'Prueba', 'hash', ${mustChange}, ${expiresAt}, NOW(6), NOW(6))`,
      );
    await expect(user('caduca-sin-temporal@sirai.test', 0, '2030-01-01 00:00:00')).rejects.toThrow();
    await expect(user('temporal@sirai.test', 1, '2030-01-01 00:00:00')).resolves.toBeDefined();
    await expect(user('normal@sirai.test', 0, null)).resolves.toBeDefined();
    // Se limpian para no alterar el conteo de usuarios que verifica la prueba de la semilla.
    await connection.db.execute(sql`DELETE FROM usuarios WHERE correo IN ('temporal@sirai.test', 'normal@sirai.test')`);
  });

  it('un sistema externo solo puede estar activo o revocado, y revocado exige fecha (RF-37)', async () => {
    await connection.db.execute(sql`INSERT INTO usuarios (correo, nombre, password_hash, created_at, updated_at) VALUES ('creador-sistemas@sirai.test', 'Creador', 'hash', NOW(6), NOW(6))`);
    const [admin] = (await connection.db.execute(sql`SELECT id FROM usuarios WHERE correo = 'creador-sistemas@sirai.test'`)) as unknown as [{ id: number }[]];
    const adminId = admin[0]?.id;
    const system = (clientId: string, status: string, revokedAt: string | null, scopes = 'REPORTE_AGREGADO_LEER') =>
      connection.db.execute(
        sql`INSERT INTO sistemas_integracion (nombre, client_id, secret_hash, alcances, estatus, revocado_at, creado_por, created_at, updated_at) VALUES ('Sistema', ${clientId}, 'hash', ${scopes}, ${status}, ${revokedAt}, ${adminId}, NOW(6), NOW(6))`,
      );
    await expect(system('a'.repeat(32), 'SUSPENDIDO', null)).rejects.toThrow();
    await expect(system('b'.repeat(32), 'REVOCADO', null)).rejects.toThrow();
    await expect(system('c'.repeat(32), 'ACTIVO', '2030-01-01 00:00:00')).rejects.toThrow();
    await expect(system('d'.repeat(32), 'ACTIVO', null, '')).rejects.toThrow();
    await expect(system('e'.repeat(32), 'ACTIVO', null)).resolves.toBeDefined();
    await expect(system('e'.repeat(32), 'ACTIVO', null)).rejects.toThrow();
    await expect(system('f'.repeat(32), 'REVOCADO', '2030-01-01 00:00:00')).resolves.toBeDefined();
    // Se limpian para no alterar el conteo de usuarios que verifica la prueba de la semilla.
    await connection.db.execute(sql`DELETE FROM sistemas_integracion WHERE client_id IN (${'e'.repeat(32)}, ${'f'.repeat(32)})`);
    await connection.db.execute(sql`DELETE FROM usuarios WHERE correo = 'creador-sistemas@sirai.test'`);
  });

  it('solo puede haber un ciclo escolar activo, y solo un ciclo archivado se depura (RNF-05)', async () => {
    const year = (code: string, status: string, archivedAt: string | null, purgedAt: string | null) =>
      connection.db.execute(
        sql`INSERT INTO ciclos_escolares (codigo, fecha_inicio, fecha_fin, estado, archivado_at, depurado_at) VALUES (${code}, '2030-08-01', '2031-07-01', ${status}, ${archivedAt}, ${purgedAt})`,
      );
    // Ya hay un ciclo activo de las pruebas anteriores; con o sin él, un segundo activo debe rechazarse.
    const [active] = (await connection.db.execute(sql`SELECT COUNT(*) AS n FROM ciclos_escolares WHERE estado = 'ACTIVO'`)) as unknown as [{ n: number }[]];
    if (Number(active[0]?.n) === 0) await expect(year('RET-A', 'ACTIVO', null, null)).resolves.toBeDefined();
    await expect(year('RET-B', 'ACTIVO', null, null)).rejects.toThrow();
    await expect(year('RET-C', 'ACTIVO', null, '2031-01-01 00:00:00')).rejects.toThrow();
    await expect(year('RET-D', 'ARCHIVADO', null, '2031-01-01 00:00:00')).rejects.toThrow();
    await expect(year('RET-E', 'ARCHIVADO', '2031-08-01 00:00:00', '2031-01-01 00:00:00')).rejects.toThrow();
    await expect(year('RET-F', 'ARCHIVADO', '2031-08-01 00:00:00', '2036-08-01 00:00:00')).resolves.toBeDefined();
    await expect(year('RET-G', 'ARCHIVADO', '2031-08-01 00:00:00', null)).resolves.toBeDefined();
    await connection.db.execute(sql`DELETE FROM ciclos_escolares WHERE codigo LIKE 'RET-%'`);
  });

  it('el esquema Drizzle de infantes y tutores coincide con las tablas reales', async () => {
    const now = new Date();
    const secret = Buffer.from('cifrado-de-prueba');
    await connection.db.insert(children).values({
      enrollmentNumber: 'M-DRZ-1',
      name: 'Infante',
      paternalSurname: 'Prueba',
      birthDate: '2024-03-10',
      hasDisability: true,
      disabilityGroupEncrypted: secret,
      createdAt: now,
      updatedAt: now,
    });
    await connection.db.insert(guardians).values({
      name: 'Tutor',
      paternalSurname: 'Prueba',
      phoneEncrypted: secret,
      phoneHash: Buffer.alloc(32, 1),
      createdAt: now,
      updatedAt: now,
    });
    const [child] = await connection.db.select().from(children).where(sql`${children.enrollmentNumber} = 'M-DRZ-1'`);
    const [guardian] = await connection.db.select().from(guardians);
    expect(child?.status).toBe('ACTIVO');
    expect(child?.hasDisability).toBe(true);
    expect(child?.disabilityGroupEncrypted?.equals(secret)).toBe(true);
    expect(guardian?.phoneHash?.length).toBe(32);
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

  it('siembra un ciclo escolar activo y salas ficticias, sin duplicar al repetir', async () => {
    const cycles = await connection.db.select().from(ciclosEscolares);
    expect(cycles.filter((cycle) => cycle.status === 'ACTIVO')).toHaveLength(1);
    const seededRooms = await connection.db.select().from(rooms);
    expect(seededRooms.length).toBeGreaterThanOrEqual(DEV_ROOMS.length);
    expect(seededRooms.map((room) => room.name)).toEqual(expect.arrayContaining(DEV_ROOMS.map((room) => room.name)));
  });

  it('el registro de expedientes emitidos es inmutable una vez sellado', async () => {
    const rootMessage = (error: unknown): string =>
      error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error);
    await connection.db.execute(sql`INSERT INTO estancias (clave_ebdi, nombre) VALUES ('EXP-01', 'Estancia de expedientes')`);
    await connection.db.execute(sql`INSERT INTO usuarios (nombre, correo, password_hash) VALUES ('Emisor', 'emisor@sirai.test', 'x')`);
    await connection.db.execute(
      sql`INSERT INTO infantes (matricula, nombre, apellido_paterno, fecha_nacimiento) VALUES ('M-EXP-1', 'Infante', 'Prueba', '2025-01-01')`,
    );
    await connection.db.execute(
      sql`INSERT INTO expedientes_emitidos (infante_id, estancia_id, emitido_por, emitido_at, contenido_sha256)
          SELECT i.id, e.id, u.id, NOW(6), UNHEX(SHA2('contenido', 256)) FROM infantes i, estancias e, usuarios u
          WHERE i.matricula = 'M-EXP-1' AND e.clave_ebdi = 'EXP-01' AND u.correo = 'emisor@sirai.test'`,
    );
    // Sin sello todavía: se puede sellar una vez.
    await connection.db.execute(sql`UPDATE expedientes_emitidos SET sello = UNHEX(SHA2('sello', 256)) WHERE sello IS NULL`);
    await expect(connection.db.execute(sql`UPDATE expedientes_emitidos SET sello = UNHEX(SHA2('otro', 256))`).catch((e: unknown) => Promise.reject(rootMessage(e)))).rejects.toMatch(/inmutable/);
    await expect(connection.db.execute(sql`DELETE FROM expedientes_emitidos`).catch((e: unknown) => Promise.reject(rootMessage(e)))).rejects.toMatch(/inmutable/);
  });

  it('la sincronización guarda el acuse de cada operación una sola vez y rechaza valores fuera del catálogo', async () => {
    await connection.db.execute(sql`INSERT INTO estancias (clave_ebdi, nombre) VALUES ('SYN-01', 'Estancia de sincronización')`);
    await connection.db.execute(sql`INSERT INTO usuarios (nombre, correo, password_hash) VALUES ('Sync', 'sync@sirai.test', 'x')`);
    const insert = (uuid: string, entity: string, state: string) =>
      connection.db.execute(
        sql`INSERT INTO sincronizaciones (usuario_id, estancia_id, uuid_operacion, entidad, operacion, fecha_captura_local, estado, respuesta_json)
            SELECT u.id, e.id, ${uuid}, ${entity}, 'REGISTRAR', NOW(6), ${state}, JSON_OBJECT('saved', 1)
            FROM usuarios u, estancias e WHERE u.correo = 'sync@sirai.test' AND e.clave_ebdi = 'SYN-01'`,
      );
    const op = '11111111-1111-4111-8111-111111111111';
    await expect(insert(op, 'ASISTENCIA', 'APLICADA')).resolves.toBeDefined();
    await expect(insert(op, 'ASISTENCIA', 'APLICADA')).rejects.toThrow();
    await expect(insert('22222222-2222-4222-8222-222222222222', 'ASISTENCIA', 'QUIZA')).rejects.toThrow();
    await expect(insert('33333333-3333-4333-8333-333333333333', 'OTRA', 'APLICADA')).rejects.toThrow();
  });
});
