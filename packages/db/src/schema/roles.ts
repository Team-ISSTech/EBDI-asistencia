import {
  bigint,
  datetime,
  index,
  mysqlTable,
  primaryKey,
  smallint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { estancias } from './estancias.js';
import { usuarios } from './usuarios.js';

export const roles = mysqlTable(
  'roles',
  {
    id: smallint('id', { unsigned: true }).autoincrement().primaryKey(),
    code: varchar('codigo', { length: 50 }).notNull(),
    name: varchar('nombre', { length: 100 }).notNull(),
    description: varchar('descripcion', { length: 255 }),
  },
  (table) => [uniqueIndex('uq_roles_codigo').on(table.code)],
);

export const permisos = mysqlTable(
  'permisos',
  {
    id: smallint('id', { unsigned: true }).autoincrement().primaryKey(),
    code: varchar('codigo', { length: 80 }).notNull(),
    description: varchar('descripcion', { length: 255 }).notNull(),
  },
  (table) => [uniqueIndex('uq_permisos_codigo').on(table.code)],
);

/** Asignación de rol a usuario; `estanciaId` nulo significa alcance global. */
export const usuarioRol = mysqlTable(
  'usuario_rol',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('usuario_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    roleId: smallint('rol_id', { unsigned: true })
      .notNull()
      .references(() => roles.id),
    estanciaId: bigint('estancia_id', { mode: 'number', unsigned: true }).references(
      () => estancias.id,
    ),
    validFrom: datetime('vigente_desde', { fsp: 6 }).notNull(),
    validUntil: datetime('vigente_hasta', { fsp: 6 }),
  },
  (table) => [
    uniqueIndex('uq_usuario_rol_estancia').on(table.userId, table.roleId, table.estanciaId),
    index('idx_usuario_rol_rol').on(table.roleId),
    index('idx_usuario_rol_estancia').on(table.estanciaId),
  ],
);

export const rolPermiso = mysqlTable(
  'rol_permiso',
  {
    roleId: smallint('rol_id', { unsigned: true })
      .notNull()
      .references(() => roles.id),
    permissionId: smallint('permiso_id', { unsigned: true })
      .notNull()
      .references(() => permisos.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);
