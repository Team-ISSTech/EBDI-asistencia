import { bigint, date, datetime, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { estancias } from './estancias.js';
import { usuarios } from './usuarios.js';

export const jornadasAsistencia = mysqlTable(
  'jornadas_asistencia',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    estanciaId: bigint('estancia_id', { mode: 'number', unsigned: true }).notNull().references(() => estancias.id),
    date: date('fecha', { mode: 'string' }).notNull(),
    shift: varchar('turno', { length: 20 }).notNull(),
    status: varchar('estado', { length: 20 }).notNull().default('ABIERTA'),
    openedAt: datetime('abierta_at', { fsp: 6 }).notNull(),
    closedAt: datetime('cerrada_at', { fsp: 6 }),
    openedBy: bigint('abierta_por', { mode: 'number', unsigned: true }).notNull().references(() => usuarios.id),
    closedBy: bigint('cerrada_por', { mode: 'number', unsigned: true }).references(() => usuarios.id),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_jornada_estancia_fecha_turno').on(table.estanciaId, table.date, table.shift),
    index('idx_jornadas_fecha_estado').on(table.date, table.status),
  ],
);
