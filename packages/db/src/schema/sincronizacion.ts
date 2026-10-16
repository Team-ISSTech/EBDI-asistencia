import { bigint, char, datetime, index, json, mysqlTable, smallint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { estancias } from './estancias.js';
import { binaryBytes } from './types.js';
import { usuarios } from './usuarios.js';

const SHA256_BYTES = 32;

/**
 * Acuse de una operación capturada sin conexión (RF-22). El UUID es único: un
 * reintento recibe la respuesta guardada. La respuesta no lleva datos de
 * menores, solo conteos, códigos y referencias numéricas.
 */
export const syncOperations = mysqlTable(
  'sincronizaciones',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('usuario_id', { mode: 'number', unsigned: true }).notNull().references(() => usuarios.id),
    estanciaId: bigint('estancia_id', { mode: 'number', unsigned: true }).notNull().references(() => estancias.id),
    operationId: char('uuid_operacion', { length: 36 }).notNull(),
    entity: varchar('entidad', { length: 50 }).notNull(),
    operation: varchar('operacion', { length: 20 }).notNull(),
    capturedAt: datetime('fecha_captura_local', { fsp: 6 }).notNull(),
    receivedAt: datetime('fecha_recepcion_servidor', { fsp: 6 }).notNull(),
    status: varchar('estado', { length: 20 }).notNull(),
    payloadSha256: binaryBytes(SHA256_BYTES)('payload_sha256'),
    errorMessage: varchar('mensaje_error', { length: 1000 }),
    retries: smallint('reintentos', { unsigned: true }).notNull().default(0),
    response: json('respuesta_json'),
  },
  (table) => [uniqueIndex('uq_sincronizaciones_uuid').on(table.operationId), index('idx_sincronizaciones_estancia').on(table.estanciaId, table.receivedAt)],
);
