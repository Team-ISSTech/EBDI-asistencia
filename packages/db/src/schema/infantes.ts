import { bigint, boolean, char, date, datetime, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { varbinaryBytes } from './types.js';
import { usuarios } from './usuarios.js';

const ENCRYPTED_FIELD_BYTES = 512;
const encrypted = varbinaryBytes(ENCRYPTED_FIELD_BYTES);

/** Datos de salud (grupo de discapacidad) solo en columna cifrada. */
export const children = mysqlTable(
  'infantes',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    enrollmentNumber: varchar('matricula', { length: 20 }).notNull(),
    curp: char('curp', { length: 18 }),
    name: varchar('nombre', { length: 100 }).notNull(),
    paternalSurname: varchar('apellido_paterno', { length: 100 }).notNull(),
    maternalSurname: varchar('apellido_materno', { length: 100 }),
    birthDate: date('fecha_nacimiento', { mode: 'string' }).notNull(),
    gender: varchar('genero', { length: 20 }),
    hasDisability: boolean('tiene_discapacidad').notNull().default(false),
    disabilityGroupEncrypted: encrypted('grupo_discapacidad_cifrado'),
    status: varchar('estatus', { length: 20 }).notNull().default('ACTIVO'),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [
    uniqueIndex('uq_infantes_matricula').on(table.enrollmentNumber),
    uniqueIndex('uq_infantes_curp').on(table.curp),
    index('idx_infantes_nombre').on(table.paternalSurname, table.maternalSurname, table.name),
    index('idx_infantes_estatus').on(table.status),
  ],
);
