import { bigint, datetime, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { binaryBytes, varbinaryBytes } from './types.js';
import { estancias } from './estancias.js';
import { usuarios } from './usuarios.js';

export const sesiones = mysqlTable(
  'sesiones',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('usuario_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    activeEstanciaId: bigint('estancia_activa_id', { mode: 'number', unsigned: true }).references(
      () => estancias.id,
    ),
    tokenHash: binaryBytes(32)('token_hash').notNull(),
    ipAddress: varbinaryBytes(16)('ip_origen'),
    userAgent: varchar('user_agent', { length: 512 }),
    expiresAt: datetime('expira_at', { fsp: 6 }).notNull(),
    revokedAt: datetime('revocada_at', { fsp: 6 }),
    lastUsedAt: datetime('ultimo_uso_at', { fsp: 6 }).notNull(),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_sesiones_token_hash').on(table.tokenHash),
    index('idx_sesiones_usuario_expira').on(table.userId, table.expiresAt),
  ],
);
