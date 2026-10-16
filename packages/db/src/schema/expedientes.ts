import { bigint, datetime, index, mysqlTable } from 'drizzle-orm/mysql-core';
import { estancias } from './estancias.js';
import { children } from './infantes.js';
import { binaryBytes } from './types.js';
import { usuarios } from './usuarios.js';

const SHA256_BYTES = 32;

/**
 * Expediente de un infante emitido para un traslado (RF-19). El folio es el id.
 * Se inserta sin sello, se sella una sola vez y desde entonces es inmutable.
 */
export const issuedDossiers = mysqlTable(
  'expedientes_emitidos',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    childId: bigint('infante_id', { mode: 'number', unsigned: true }).notNull().references(() => children.id),
    estanciaId: bigint('estancia_id', { mode: 'number', unsigned: true }).notNull().references(() => estancias.id),
    issuedBy: bigint('emitido_por', { mode: 'number', unsigned: true }).notNull().references(() => usuarios.id),
    issuedAt: datetime('emitido_at', { fsp: 6 }).notNull(),
    contentSha256: binaryBytes(SHA256_BYTES)('contenido_sha256').notNull(),
    seal: binaryBytes(SHA256_BYTES)('sello'),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  },
  (table) => [index('idx_expedientes_infante').on(table.childId, table.issuedAt), index('idx_expedientes_estancia').on(table.estanciaId, table.issuedAt)],
);
