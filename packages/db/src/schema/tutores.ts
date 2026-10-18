import { bigint, boolean, date, datetime, index, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core';
import { children } from './infantes.js';
import { binaryBytes, varbinaryBytes } from './types.js';
import { usuarios } from './usuarios.js';

const PHONE_CIPHER_BYTES = 512;
const SHA256_BYTES = 32;

/** El teléfono se guarda cifrado; el hash permite buscarlo sin descifrar. */
export const guardians = mysqlTable(
  'tutores',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('nombre', { length: 100 }).notNull(),
    paternalSurname: varchar('apellido_paterno', { length: 100 }).notNull(),
    maternalSurname: varchar('apellido_materno', { length: 100 }),
    idType: varchar('identificacion_tipo', { length: 30 }),
    idFolio: varchar('identificacion_folio', { length: 100 }),
    phoneEncrypted: varbinaryBytes(PHONE_CIPHER_BYTES)('telefono_cifrado'),
    phoneHash: binaryBytes(SHA256_BYTES)('telefono_hash'),
    email: varchar('correo', { length: 190 }),
    status: varchar('estatus', { length: 20 }).notNull().default('ACTIVO'),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [
    index('idx_tutores_telefono_hash').on(table.phoneHash),
    index('idx_tutores_correo').on(table.email),
    index('idx_tutores_nombre').on(table.paternalSurname, table.maternalSurname, table.name),
  ],
);

export const childGuardians = mysqlTable(
  'infante_tutor',
  {
    childId: bigint('infante_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => children.id),
    guardianId: bigint('tutor_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => guardians.id),
    relationship: varchar('parentesco', { length: 50 }).notNull(),
    isPrimary: boolean('es_tutor_principal').notNull().default(false),
    canPickUp: boolean('autorizado_recoger').notNull().default(false),
    isEmergencyContact: boolean('es_contacto_emergencia').notNull().default(false),
    validFrom: date('vigencia_desde', { mode: 'string' }).notNull(),
    validUntil: date('vigencia_hasta', { mode: 'string' }),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }).references(() => usuarios.id),
  },
  (table) => [
    primaryKey({ columns: [table.childId, table.guardianId] }),
    index('idx_infante_tutor_tutor').on(table.guardianId),
  ],
);
