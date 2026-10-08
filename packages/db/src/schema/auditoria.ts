import { bigint, char, datetime, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { longblob, varbinaryBytes } from './types.js';
import { usuarios } from './usuarios.js';

/** Bitácora inmutable: la API solo inserta. Nunca UPDATE ni DELETE. */
export const auditoria = mysqlTable(
  'auditoria',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('usuario_id', { mode: 'number', unsigned: true }).references(() => usuarios.id),
    roleCode: varchar('rol_codigo', { length: 50 }),
    action: varchar('accion', { length: 30 }).notNull(),
    tableName: varchar('tabla_afectada', { length: 80 }).notNull(),
    recordId: varchar('registro_id', { length: 100 }),
    previousDataEncrypted: longblob('datos_anteriores_cifrados'),
    newDataEncrypted: longblob('datos_nuevos_cifrados'),
    ipAddress: varbinaryBytes(16)('ip_origen'),
    userAgent: varchar('user_agent', { length: 512 }),
    requestId: char('request_id', { length: 36 }),
    occurredAt: datetime('ocurrido_at', { fsp: 6 }).notNull(),
  },
  (table) => [
    index('idx_auditoria_usuario_fecha').on(table.userId, table.occurredAt),
    index('idx_auditoria_registro').on(table.tableName, table.recordId, table.occurredAt),
    index('idx_auditoria_request_id').on(table.requestId),
  ],
);
