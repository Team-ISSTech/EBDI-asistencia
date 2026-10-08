import { bigint, datetime, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';

/**
 * Nombres de tabla y columna en español porque así los definió el equipo en el
 * esquema SQL (fuente de verdad). Las propiedades TypeScript van en inglés;
 * este archivo es el punto de traducción entre ambos.
 */
export const estancias = mysqlTable(
  'estancias',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    ebdiCode: varchar('clave_ebdi', { length: 20 }).notNull(),
    ur: varchar('ur', { length: 10 }),
    name: varchar('nombre', { length: 150 }).notNull(),
    region: varchar('region', { length: 100 }),
    address: varchar('direccion', { length: 255 }),
    timeZone: varchar('zona_horaria', { length: 50 }).notNull().default('America/Mexico_City'),
    status: varchar('estatus', { length: 20 }).notNull().default('ACTIVA'),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
  },
  (table) => [
    uniqueIndex('uq_estancias_clave_ebdi').on(table.ebdiCode),
    index('idx_estancias_estatus').on(table.status),
  ],
);
