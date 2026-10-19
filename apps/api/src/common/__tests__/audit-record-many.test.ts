import { describe, expect, it } from 'vitest';
import type { Db } from '@sirai/db';
import { AuditService, type AuditEntry, type AuditExecutor } from '../audit/audit.service';
import { EncryptionService } from '../crypto/encryption.service';

const encryption = new EncryptionService({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) } as never);
const request = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };

const entry = (recordId: string, after: unknown): AuditEntry => ({ userId: 3, roleCode: 'DOCENTE', action: 'ASISTENCIA_REGISTRADA', tableName: 'asistencias', recordId, after, request });

/** Ejecutor falso que cuenta las sentencias INSERT y guarda lo que se le pidió insertar. */
const fakeExecutor = () => {
  const inserts: unknown[] = [];
  const executor = { insert: () => ({ values: (rows: unknown) => { inserts.push(rows); return Promise.resolve(); } }) } as unknown as AuditExecutor;
  return { executor, inserts };
};

describe('AuditService.recordMany', () => {
  it('guarda todas las entradas con una sola sentencia INSERT', async () => {
    const { executor, inserts } = fakeExecutor();
    await new AuditService({} as Db, encryption).recordMany([entry('1', { status: 'PRESENTE' }), entry('2', { status: 'AUSENTE_JUSTIFICADO' }), entry('3', null)], executor);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toHaveLength(3);
  });

  it('cada fila lleva su propio registro y sus diferencias cifradas', async () => {
    const { executor, inserts } = fakeExecutor();
    await new AuditService({} as Db, encryption).recordMany([entry('1', { status: 'PRESENTE' }), entry('2', { status: 'FALTA_INJUSTIFICADA' })], executor);
    const rows = inserts[0] as Array<{ recordId: string; newDataEncrypted: Buffer; action: string }>;
    expect(rows.map((row) => row.recordId)).toEqual(['1', '2']);
    expect(encryption.decryptJson(rows[1]?.newDataEncrypted as Buffer)).toEqual({ status: 'FALTA_INJUSTIFICADA' });
    expect(rows[0]?.action).toBe('ASISTENCIA_REGISTRADA');
  });

  it('sin entradas no toca la base', async () => {
    const { executor, inserts } = fakeExecutor();
    await new AuditService({} as Db, encryption).recordMany([], executor);
    expect(inserts).toEqual([]);
  });
});
