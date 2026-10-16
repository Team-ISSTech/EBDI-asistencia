import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type DbConnection } from '../client.js';
import { applyMigrations, dropAllObjects } from '../migrate/runner.js';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(import.meta.dirname, '../../sql');
const BEFORE_CYCLES = ['0000_esquema_equipo.sql', '0001_sesiones.sql', '0002_auditoria_inmutable.sql'];

type Rows<T> = [T[]];

/**
 * Una base que ya tiene jornadas de asistencia (el módulo de asistencia las
 * escribe desde antes de los ciclos escolares) debe sobrevivir a la 0003:
 * la columna nueva es NOT NULL, así que la migración tiene que rellenarla.
 */
describe.skipIf(!TEST_DATABASE_URL)('migración 0003 sobre una base con datos (integración)', () => {
  let connection: DbConnection;
  let workDir = '';

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    await dropAllObjects(TEST_DATABASE_URL);
    workDir = await mkdtemp(join(tmpdir(), 'sirai-migraciones-'));
    for (const name of BEFORE_CYCLES) await copyFile(join(SQL_DIR, name), join(workDir, name));
    await applyMigrations(TEST_DATABASE_URL, workDir);
    connection = connect(TEST_DATABASE_URL);
    await connection.db.execute(sql`INSERT INTO estancias (clave_ebdi, nombre) VALUES ('LEG-01', 'Estancia previa')`);
    await connection.db.execute(sql`INSERT INTO usuarios (nombre, correo, password_hash) VALUES ('Previa', 'previa@sirai.test', 'x')`);
    await connection.db.execute(
      sql`INSERT INTO jornadas_asistencia (estancia_id, fecha, turno, abierta_at, abierta_por)
          SELECT e.id, '2026-09-01', 'MATUTINO', NOW(6), u.id FROM estancias e, usuarios u LIMIT 1`,
    );
    await connection.db.execute(
      sql`INSERT INTO jornadas_asistencia (estancia_id, fecha, turno, abierta_at, abierta_por)
          SELECT e.id, '2026-10-01', 'MATUTINO', NOW(6), u.id FROM estancias e, usuarios u LIMIT 1`,
    );
  });

  afterAll(async () => {
    await connection?.close();
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('aplica el resto de las migraciones sin fallar', async () => {
    const report = await applyMigrations(TEST_DATABASE_URL!, SQL_DIR);
    expect(report.applied).toEqual((await readdir(SQL_DIR)).filter((name) => !BEFORE_CYCLES.includes(name)).sort());
  });

  it('asigna las jornadas existentes a un ciclo que cubre sus fechas', async () => {
    const [rows] = (await connection.db.execute(
      sql`SELECT c.codigo, c.estado, c.fecha_inicio AS inicio, c.fecha_fin AS fin, COUNT(*) AS jornadas
          FROM jornadas_asistencia j JOIN ciclos_escolares c ON c.id = j.ciclo_escolar_id GROUP BY c.id`,
    )) as unknown as Rows<{ codigo: string; estado: string; inicio: unknown; fin: unknown; jornadas: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ codigo: 'MIGRADO', estado: 'ACTIVO', jornadas: 2 });
    expect(String(rows[0]?.inicio)).toContain('2026');
  });

  it('deja la columna obligatoria y con llave foránea', async () => {
    const [column] = (await connection.db.execute(
      sql`SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jornadas_asistencia' AND COLUMN_NAME = 'ciclo_escolar_id'`,
    )) as unknown as Rows<{ nullable: string }>;
    expect(column[0]?.nullable).toBe('NO');
    const [fks] = (await connection.db.execute(
      sql`SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jornadas_asistencia' AND CONSTRAINT_NAME = 'fk_jornadas_ciclo'`,
    )) as unknown as Rows<{ name: string }>;
    expect(fks).toHaveLength(1);
  });
});
