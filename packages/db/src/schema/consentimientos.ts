import { bigint, boolean, datetime, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { children } from './infantes.js';
import { guardians } from './tutores.js';
import { binaryBytes } from './types.js';
import { usuarios } from './usuarios.js';

const SHA256_BYTES = 32;

/** Aceptación del aviso de privacidad por el tutor; la revocación no borra la fila. */
export const consents = mysqlTable(
  'consentimientos',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    childId: bigint('infante_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => children.id),
    guardianId: bigint('tutor_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => guardians.id),
    type: varchar('tipo', { length: 60 }).notNull(),
    noticeVersion: varchar('version_aviso', { length: 30 }).notNull(),
    accepted: boolean('aceptado').notNull(),
    acceptedAt: datetime('aceptado_at', { fsp: 6 }).notNull(),
    revokedAt: datetime('revocado_at', { fsp: 6 }),
    evidenceStorageKey: varchar('evidencia_storage_key', { length: 255 }),
    evidenceSha256: binaryBytes(SHA256_BYTES)('evidencia_sha256'),
    registeredBy: bigint('registrado_por', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => usuarios.id),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
  },
  (table) => [
    index('idx_consentimientos_infante_tipo').on(table.childId, table.type, table.acceptedAt),
    index('idx_consentimientos_tutor').on(table.guardianId),
  ],
);
