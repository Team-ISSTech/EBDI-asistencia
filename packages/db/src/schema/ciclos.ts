import { bigint, date, datetime, index, mysqlTable, smallint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { usuarios } from './usuarios.js';

/** Ciclo escolar: al archivarse, sus jornadas e inscripciones pasan a archivo histórico (RNF-05). */
export const ciclosEscolares = mysqlTable(
  'ciclos_escolares',
  {
    id: smallint('id', { unsigned: true }).autoincrement().primaryKey(),
    code: varchar('codigo', { length: 20 }).notNull(),
    startDate: date('fecha_inicio', { mode: 'string' }).notNull(),
    endDate: date('fecha_fin', { mode: 'string' }).notNull(),
    status: varchar('estado', { length: 20 }).notNull().default('ACTIVO'),
    archivedAt: datetime('archivado_at', { fsp: 6 }),
    archivedBy: bigint('archivado_por', { mode: 'number', unsigned: true }).references(() => usuarios.id),
    /** Cuando se vaciaron los datos sensibles de sus seguimientos; nulo mientras se conservan. */
    purgedAt: datetime('depurado_at', { fsp: 6 }),
    purgedBy: bigint('depurado_por', { mode: 'number', unsigned: true }).references(() => usuarios.id),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_ciclos_escolares_codigo').on(table.code),
    index('idx_ciclos_escolares_estado').on(table.status),
  ],
);
