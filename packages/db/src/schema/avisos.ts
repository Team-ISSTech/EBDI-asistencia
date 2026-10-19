import { bigint, datetime, index, mysqlTable, smallint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { followUps } from './seguimientos.js';
import { guardians } from './tutores.js';
import { usuarios } from './usuarios.js';

/**
 * Aviso a un contacto de emergencia (RF-27): uno por seguimiento y contacto.
 * No guarda el texto ni el teléfono; el número se lee cifrado del tutor al enviar.
 */
export const emergencyNotices = mysqlTable(
  'avisos_emergencia',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    followUpId: bigint('seguimiento_id', { mode: 'number', unsigned: true }).notNull().references(() => followUps.id),
    guardianId: bigint('tutor_id', { mode: 'number', unsigned: true }).notNull().references(() => guardians.id),
    status: varchar('estado', { length: 20 }).notNull().default('PENDIENTE'),
    attempts: smallint('intentos', { unsigned: true }).notNull().default(0),
    nextAttemptAt: datetime('proximo_intento_at', { fsp: 6 }),
    sentAt: datetime('enviado_at', { fsp: 6 }),
    externalMessageId: varchar('mensaje_externo_id', { length: 100 }),
    errorCode: varchar('error_codigo', { length: 60 }),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [uniqueIndex('uq_avisos_seguimiento_tutor').on(table.followUpId, table.guardianId), index('idx_avisos_pendientes').on(table.status, table.nextAttemptAt)],
);
