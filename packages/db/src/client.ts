import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema/index.js';

export type Db = ReturnType<typeof createDbFromPool>;

const createDbFromPool = (pool: mysql.Pool) => drizzle(pool, { schema, mode: 'default' });

/** Conexión abierta: el cliente Drizzle y el pool para cerrarlo al apagar. */
export interface DbConnection {
  readonly db: Db;
  close(): Promise<void>;
}

/**
 * Crea un pool `mysql2` y el cliente Drizzle sobre él. `multipleStatements`
 * queda desactivado: las migraciones usan su propia conexión.
 */
export function connect(databaseUrl: string): DbConnection {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    timezone: 'Z',
    dateStrings: false,
  });
  return { db: createDbFromPool(pool), close: () => pool.end() };
}
