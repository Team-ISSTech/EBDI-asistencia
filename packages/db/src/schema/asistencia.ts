import { bigint, char, date, datetime, index, mysqlTable, smallint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { ciclosEscolares } from './ciclos.js';
import { estancias } from './estancias.js';
import { enrollments } from './inscripciones.js';
import { usuarios } from './usuarios.js';

export const jornadasAsistencia = mysqlTable(
  'jornadas_asistencia',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    estanciaId: bigint('estancia_id', { mode: 'number', unsigned: true }).notNull().references(() => estancias.id),
    schoolYearId: smallint('ciclo_escolar_id', { unsigned: true }).notNull().references(() => ciclosEscolares.id),
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

/** Un registro por infante (inscripción) y jornada; `clientId` identifica la operación del cliente. */
export const attendanceRecords = mysqlTable(
  'asistencias',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    journeyId: bigint('jornada_id', { mode: 'number', unsigned: true }).notNull().references(() => jornadasAsistencia.id),
    enrollmentId: bigint('inscripcion_id', { mode: 'number', unsigned: true }).notNull().references(() => enrollments.id),
    status: varchar('estado', { length: 30 }).notNull(),
    enteredAt: datetime('hora_entrada', { fsp: 6 }),
    leftAt: datetime('hora_salida', { fsp: 6 }),
    method: varchar('metodo_registro', { length: 20 }).notNull().default('MANUAL'),
    clientId: char('uuid_cliente', { length: 36 }).notNull(),
    recordedBy: bigint('registrado_por', { mode: 'number', unsigned: true }).notNull().references(() => usuarios.id),
    recordedAt: datetime('registrado_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_asistencia_jornada_inscripcion').on(table.journeyId, table.enrollmentId),
    uniqueIndex('uq_asistencia_uuid_cliente').on(table.clientId),
    index('idx_asistencias_jornada_estado').on(table.journeyId, table.status),
  ],
);
