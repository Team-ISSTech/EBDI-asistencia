import { bigint, datetime, index, mysqlTable, smallint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { estancias } from './estancias.js';
import { usuarios } from './usuarios.js';

export const rooms = mysqlTable(
  'salas_grupos',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    estanciaId: bigint('estancia_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => estancias.id),
    name: varchar('nombre', { length: 100 }).notNull(),
    shift: varchar('turno', { length: 20 }).notNull(),
    minAgeMonths: smallint('edad_minima_meses', { unsigned: true }),
    maxAgeMonths: smallint('edad_maxima_meses', { unsigned: true }),
    capacity: smallint('capacidad', { unsigned: true }),
    status: varchar('estatus', { length: 20 }).notNull().default('ACTIVO'),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [
    uniqueIndex('uq_sala_estancia_nombre_turno').on(table.estanciaId, table.name, table.shift),
    index('idx_salas_estancia_estatus').on(table.estanciaId, table.status),
  ],
);
