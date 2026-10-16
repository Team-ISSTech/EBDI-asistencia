import { bigint, boolean, date, datetime, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { attendanceRecords } from './asistencia.js';
import { usuarios } from './usuarios.js';

/** Ticket de seguimiento: uno por ausencia (registro de asistencia). Se cierra, nunca se borra. */
export const followUps = mysqlTable(
  'seguimientos',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    attendanceRecordId: bigint('asistencia_id', { mode: 'number', unsigned: true }).notNull().references(() => attendanceRecords.id),
    cause: varchar('clasificacion', { length: 30 }),
    status: varchar('estado', { length: 30 }).notNull().default('ABIERTO'),
    expectedReturnDate: date('fecha_probable_retorno', { mode: 'string' }),
    requiresMedicalRelease: boolean('requiere_alta_medica').notNull().default(false),
    assigneeId: bigint('responsable_usuario_id', { mode: 'number', unsigned: true }).references(() => usuarios.id),
    openedAt: datetime('abierto_at', { fsp: 6 }).notNull(),
    closedAt: datetime('cerrado_at', { fsp: 6 }),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [
    uniqueIndex('uq_seguimientos_asistencia').on(table.attendanceRecordId),
    index('idx_seguimientos_estado_responsable').on(table.status, table.assigneeId),
    index('idx_seguimientos_retorno').on(table.expectedReturnDate),
  ],
);
