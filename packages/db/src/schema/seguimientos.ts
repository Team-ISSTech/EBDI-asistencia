import { bigint, boolean, char, date, datetime, index, mysqlTable, smallint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { attendanceRecords } from './asistencia.js';
import { guardians } from './tutores.js';
import { longblob, varbinaryBytes } from './types.js';
import { usuarios } from './usuarios.js';

const PHONE_CIPHER_BYTES = 512;

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

/**
 * Intento de contacto con el tutor. El teléfono marcado y las notas de asesoría
 * son datos sensibles: solo existen cifrados. Un intento no se borra.
 */
export const followUpContacts = mysqlTable(
  'contactos_seguimiento',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    followUpId: bigint('seguimiento_id', { mode: 'number', unsigned: true }).notNull().references(() => followUps.id),
    guardianId: bigint('tutor_id', { mode: 'number', unsigned: true }).references(() => guardians.id),
    attemptNumber: smallint('numero_intento', { unsigned: true }).notNull(),
    occurredAt: datetime('fecha_hora', { fsp: 6 }).notNull(),
    channel: varchar('canal', { length: 20 }).notNull().default('TELEFONO'),
    result: varchar('resultado', { length: 40 }).notNull(),
    phoneEncrypted: varbinaryBytes(PHONE_CIPHER_BYTES)('telefono_destino_cifrado'),
    notesEncrypted: longblob('notas_asesoria_cifradas'),
    nextAttemptAt: datetime('proximo_intento_at', { fsp: 6 }),
    /** UUID de la operación sin conexión que lo creó; evita duplicarlo al reintentar. */
    operationId: char('uuid_operacion', { length: 36 }),
    registeredBy: bigint('registrado_por', { mode: 'number', unsigned: true }).notNull().references(() => usuarios.id),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [
    uniqueIndex('uq_contacto_seguimiento_intento').on(table.followUpId, table.attemptNumber),
    uniqueIndex('uq_contacto_uuid_operacion').on(table.operationId),
    index('idx_contactos_fecha').on(table.followUpId, table.occurredAt),
    index('idx_contactos_proximo_intento').on(table.nextAttemptAt),
  ],
);

/**
 * Alta médica (RF-30): libera el candado "requiere alta para ingresar". Una por
 * ticket. Las observaciones son datos de salud y solo existen cifradas.
 */
export const medicalReleases = mysqlTable(
  'altas_medicas',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    followUpId: bigint('seguimiento_id', { mode: 'number', unsigned: true }).notNull().references(() => followUps.id),
    dischargeDate: date('fecha_alta', { mode: 'string' }).notNull(),
    doctorId: bigint('medico_usuario_id', { mode: 'number', unsigned: true }).notNull().references(() => usuarios.id),
    folio: varchar('folio', { length: 100 }),
    observationsEncrypted: longblob('observaciones_cifradas'),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  },
  (table) => [uniqueIndex('uq_alta_seguimiento').on(table.followUpId), index('idx_altas_medico_fecha').on(table.doctorId, table.dischargeDate)],
);
