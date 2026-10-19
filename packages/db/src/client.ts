import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema/index.js';

const DEFAULT_POOL_SIZE = 10;

export type Db = ReturnType<typeof createDbFromPool>;

const createDbFromPool = (pool: mysql.Pool) => drizzle(pool, { schema, mode: 'default' });

/** Conexión abierta: el cliente Drizzle y el pool para cerrarlo al apagar. */
export interface DbConnection {
  readonly db: Db;
  close(): Promise<void>;
}

/**
 * Crea un pool `mysql2` y el cliente Drizzle sobre él. `multipleStatements`
 * queda desactivado: las migraciones usan su propia conexión. `poolSize` fija las conexiones simultáneas.
 */
export function connect(databaseUrl: string, options: { readonly poolSize?: number } = {}): DbConnection {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: options.poolSize ?? DEFAULT_POOL_SIZE,
    timezone: 'Z',
    dateStrings: false,
  });
  return { db: createDbFromPool(pool), close: () => pool.end() };
}
