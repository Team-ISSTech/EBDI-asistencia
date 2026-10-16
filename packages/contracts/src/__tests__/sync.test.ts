import { describe, expect, it } from 'vitest';
import { SYNC_MAX_OPERATIONS, syncRequestSchema, syncResponseSchema } from '../sync/sync.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-10-16T14:00:00.000Z';

const marksOp = (n: number, overrides: Record<string, unknown> = {}) => ({
  operationId: uuid(n),
  type: 'ATTENDANCE_MARKS',
  capturedAt: NOW,
  payload: { journeyId: 3, marks: [{ enrollmentId: 1, status: 'PRESENTE', clientId: uuid(100 + n) }] },
  ...overrides,
});

const contactOp = (n: number) => ({
  operationId: uuid(n),
  type: 'FOLLOW_UP_CONTACT',
  capturedAt: NOW,
  payload: { followUpId: 4, contact: { result: 'SIN_RESPUESTA' } },
});

describe('syncRequestSchema (RF-20 a RF-22)', () => {
  it('acepta operaciones de pase de lista y de llamadas, cada una con su UUID y su hora de captura', () => {
    expect(syncRequestSchema.safeParse({ operations: [marksOp(1), contactOp(2)] }).success).toBe(true);
  });

  it('la llamada conserva sus reglas: hablar con el tutor exige causa y retorno', () => {
    const incomplete = { ...contactOp(2), payload: { followUpId: 4, contact: { result: 'CONTACTADO', guardianId: 3 } } };
    expect(syncRequestSchema.safeParse({ operations: [incomplete] }).success).toBe(false);
  });

  it('rechaza tipos desconocidos, UUID inválidos y horas mal formadas', () => {
    expect(syncRequestSchema.safeParse({ operations: [marksOp(1, { type: 'BORRAR_TODO' })] }).success).toBe(false);
    expect(syncRequestSchema.safeParse({ operations: [marksOp(1, { operationId: 'no-uuid' })] }).success).toBe(false);
    expect(syncRequestSchema.safeParse({ operations: [marksOp(1, { capturedAt: 'ayer' })] }).success).toBe(false);
  });

  it('rechaza lotes vacíos o con demasiadas operaciones', () => {
    expect(SYNC_MAX_OPERATIONS).toBe(50);
    expect(syncRequestSchema.safeParse({ operations: [] }).success).toBe(false);
    const many = Array.from({ length: SYNC_MAX_OPERATIONS + 1 }, (_, index) => marksOp(index + 1));
    expect(syncRequestSchema.safeParse({ operations: many }).success).toBe(false);
  });

  it('rechaza repetir un UUID de operación dentro del lote', () => {
    expect(syncRequestSchema.safeParse({ operations: [marksOp(1), contactOp(1)] }).success).toBe(false);
  });
});

describe('syncResponseSchema', () => {
  const result = { operationId: uuid(1), status: 'APLICADA', replayed: false, saved: 3, unchanged: 0, rejections: [], code: null, message: null };

  it('acepta el acuse de cada operación', () => {
    const partial = { ...result, operationId: uuid(2), status: 'PARCIAL', rejections: [{ ref: 7, code: 'CANDADO_MEDICO', message: 'Requiere alta médica.' }] };
    const rejected = { ...result, operationId: uuid(3), status: 'RECHAZADA', saved: 0, code: 'CONFLICTO', message: 'La jornada ya está cerrada.' };
    expect(syncResponseSchema.safeParse({ results: [result, partial, rejected] }).success).toBe(true);
  });

  it('el acuse no contiene datos de menores: solo conteos, códigos y referencias numéricas', () => {
    const keys = Object.keys(syncResponseSchema.shape.results.element.shape);
    expect(keys.sort()).toEqual(['code', 'message', 'operationId', 'rejections', 'replayed', 'saved', 'status', 'unchanged']);
  });

  it('rechaza estados fuera del catálogo', () => {
    expect(syncResponseSchema.safeParse({ results: [{ ...result, status: 'QUIZA' }] }).success).toBe(false);
  });
});
