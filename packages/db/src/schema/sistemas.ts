import { bigint, char, datetime, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { usuarios } from './usuarios.js';

/** Sistema externo con credenciales de máquina (RF-37). El secreto solo existe con hash. */
export const integrationSystems = mysqlTable(
  'sistemas_integracion',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('nombre', { length: 100 }).notNull(),
    clientId: char('client_id', { length: 32 }).notNull(),
    secretHash: varchar('secret_hash', { length: 255 }).notNull(),
    /** Alcances separados por coma; el catálogo vive en `packages/auth`. */
    scopes: varchar('alcances', { length: 255 }).notNull(),
    status: varchar('estatus', { length: 20 }).notNull().default('ACTIVO'),
    lastUsedAt: datetime('ultimo_uso_at', { fsp: 6 }),
    createdBy: bigint('creado_por', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    revokedAt: datetime('revocado_at', { fsp: 6 }),
    revokedBy: bigint('revocado_por', { mode: 'number', unsigned: true }).references(() => usuarios.id),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 6 }).notNull(),
  },
  (table) => [uniqueIndex('uq_sistemas_client_id').on(table.clientId), index('idx_sistemas_estatus').on(table.status)],
);
