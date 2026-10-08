import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mysql from 'mysql2/promise';

const MIGRATIONS_TABLE = '_migraciones';

/** Resultado de una corrida: qué se aplicó y qué ya estaba. */
export interface MigrationReport {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

const listSqlFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith('.sql')).sort();
};

const ensureMigrationsTable = (conn: mysql.Connection): Promise<unknown> =>
  conn.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      nombre VARCHAR(255) NOT NULL PRIMARY KEY,
      aplicada_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB`,
  );

const appliedNames = async (conn: mysql.Connection): Promise<Set<string>> => {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT nombre FROM ${MIGRATIONS_TABLE}`,
  );
  return new Set(rows.map((row) => String(row['nombre'])));
};

/**
 * Aplica en orden alfabético los archivos `.sql` de `dir` que no consten en
 * `_migraciones`. Cada archivo se ejecuta completo en una conexión con
 * `multipleStatements`; MySQL no permite DDL transaccional, así que un
 * archivo a medias debe corregirse a mano (se reporta el nombre).
 */
export async function applyMigrations(databaseUrl: string, dir: string): Promise<MigrationReport> {
  const conn = await mysql.createConnection({ uri: databaseUrl, multipleStatements: true });
  try {
    await ensureMigrationsTable(conn);
    const done = await appliedNames(conn);
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const name of await listSqlFiles(dir)) {
      if (done.has(name)) {
        skipped.push(name);
        continue;
      }
      await conn.query(await readFile(join(dir, name), 'utf8'));
      await conn.query(`INSERT INTO ${MIGRATIONS_TABLE} (nombre) VALUES (?)`, [name]);
      applied.push(name);
    }
    return { applied, skipped };
  } finally {
    await conn.end();
  }
}

const TEST_DATABASE_SUFFIX = '_test';

/** Nombre de base de datos de una URL mysql://; cadena vacía si no hay. */
export const databaseNameOf = (databaseUrl: string): string => new URL(databaseUrl).pathname.replace(/^\//, '');

/**
 * Borra todas las tablas, vistas y triggers de la base indicada. Solo para
 * bases de prueba: el nombre debe terminar en `_test`, así una URL equivocada
 * nunca vacía datos reales.
 */
export async function dropAllObjects(databaseUrl: string): Promise<void> {
  const name = databaseNameOf(databaseUrl);
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(`dropAllObjects solo acepta bases cuyo nombre termina en ${TEST_DATABASE_SUFFIX}; recibió "${name}".`);
  }
  const conn = await mysql.createConnection({ uri: databaseUrl });
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const row of rows) {
      const kind = row['type'] === 'VIEW' ? 'VIEW' : 'TABLE';
      await conn.query(`DROP ${kind} IF EXISTS \`${String(row['name'])}\``);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }
}
