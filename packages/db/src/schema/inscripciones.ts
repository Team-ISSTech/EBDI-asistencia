import { bigint, date, datetime, index, mysqlTable, smallint, varchar } from 'drizzle-orm/mysql-core';
import { ciclosEscolares } from './ciclos.js';
import { estancias } from './estancias.js';
import { children } from './infantes.js';
import { rooms } from './salas.js';
import { usuarios } from './usuarios.js';

export const enrollments = mysqlTable(
  'inscripciones',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    childId: bigint('infante_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => children.id),
    estanciaId: bigint('estancia_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => estancias.id),
    roomId: bigint('sala_grupo_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => rooms.id),
    schoolYearId: smallint('ciclo_escolar_id', { unsigned: true })
      .notNull()
      .references(() => ciclosEscolares.id),
    stratum: varchar('estrato', { length: 20 }),
    startDate: date('fecha_inicio', { mode: 'string' }).notNull(),
    endDate: date('fecha_fin', { mode: 'string' }),
    status: varchar('estatus', { length: 30 }).notNull().default('ACTIVA'),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [
    index('idx_inscripciones_infante_estatus').on(table.childId, table.status),
    index('idx_inscripciones_estancia_estatus').on(table.estanciaId, table.status),
    index('idx_inscripciones_sala_estatus').on(table.roomId, table.status),
    index('idx_inscripciones_ciclo').on(table.schoolYearId),
  ],
);

/** Bitácora de movimientos: solo se inserta, nunca se edita. */
export const enrollmentMovements = mysqlTable(
  'movimientos_inscripcion',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    enrollmentId: bigint('inscripcion_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => enrollments.id),
    type: varchar('tipo_movimiento', { length: 40 }).notNull(),
    occurredAt: datetime('fecha_movimiento', { fsp: 6 }).notNull(),
    previousEstanciaId: bigint('estancia_anterior_id', { mode: 'number', unsigned: true }).references(() => estancias.id),
    newEstanciaId: bigint('estancia_nueva_id', { mode: 'number', unsigned: true }).references(() => estancias.id),
    previousRoomId: bigint('sala_anterior_id', { mode: 'number', unsigned: true }).references(() => rooms.id),
    newRoomId: bigint('sala_nueva_id', { mode: 'number', unsigned: true }).references(() => rooms.id),
    previousStratum: varchar('estrato_anterior', { length: 20 }),
    newStratum: varchar('estrato_nuevo', { length: 20 }),
    reason: varchar('motivo', { length: 255 }),
    userId: bigint('usuario_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  },
  (table) => [
    index('idx_movimientos_inscripcion_fecha').on(table.enrollmentId, table.occurredAt),
    index('idx_movimientos_usuario_fecha').on(table.userId, table.occurredAt),
  ],
);
