import {
  bigint,
  boolean,
  datetime,
  index,
  mysqlTable,
  smallint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { estancias } from './estancias.js';

export const usuarios = mysqlTable(
  'usuarios',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    defaultEstanciaId: bigint('estancia_default_id', { mode: 'number', unsigned: true }).references(
      () => estancias.id,
    ),
    name: varchar('nombre', { length: 150 }).notNull(),
    email: varchar('correo', { length: 190 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    /** Contraseña temporal: debe cambiarse antes de usar el sistema (RF-38). */
    mustChangePassword: boolean('debe_cambiar_password').notNull().default(false),
    temporaryPasswordExpiresAt: datetime('password_temporal_expira_at', { fsp: 6 }),
    passwordChangedAt: datetime('password_cambiado_at', { fsp: 6 }),
    status: varchar('estatus', { length: 20 }).notNull().default('ACTIVO'),
    failedAttempts: smallint('intentos_fallidos', { unsigned: true }).notNull().default(0),
    lockedUntil: datetime('bloqueado_hasta', { fsp: 6 }),
    lastAccessAt: datetime('ultimo_acceso_at', { fsp: 6 }),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 6 }),
    deletedBy: bigint('deleted_by', { mode: 'number', unsigned: true }),
  },
  (table) => [
    uniqueIndex('uq_usuarios_correo').on(table.email),
    index('idx_usuarios_estancia_estatus').on(table.defaultEstanciaId, table.status),
  ],
);
