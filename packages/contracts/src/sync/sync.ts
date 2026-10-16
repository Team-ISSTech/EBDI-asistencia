import { SYNC_OPERATION_TYPES, SYNC_RESULT_STATUSES } from '@sirai/domain';
import { z } from 'zod';
import { attendanceMarkSchema } from '../attendance/record.js';
import { registerContactRequestSchema } from '../follow-ups/follow-up.js';

const positiveIdSchema = z.number().int().positive();
export const SYNC_MAX_OPERATIONS = 50;
const MAX_MARKS_PER_OPERATION = 500;

/** Todas llevan su UUID (para reconocer reintentos) y el instante en que se capturaron sin conexión. */
const operationBase = { operationId: z.uuid(), capturedAt: z.iso.datetime() };

const attendanceMarksOperation = z.object({
  ...operationBase,
  type: z.literal(SYNC_OPERATION_TYPES[0]),
  payload: z.object({ journeyId: positiveIdSchema, marks: z.array(attendanceMarkSchema).min(1).max(MAX_MARKS_PER_OPERATION) }),
});

const followUpContactOperation = z.object({
  ...operationBase,
  type: z.literal(SYNC_OPERATION_TYPES[1]),
  payload: z.object({ followUpId: positiveIdSchema, contact: registerContactRequestSchema }),
});

export const syncOperationSchema = z.discriminatedUnion('type', [attendanceMarksOperation, followUpContactOperation]);

/** Lote de operaciones capturadas sin conexión, en el orden en que ocurrieron. */
export const syncRequestSchema = z
  .object({ operations: z.array(syncOperationSchema).min(1).max(SYNC_MAX_OPERATIONS) })
  .refine(({ operations }) => new Set(operations.map((operation) => operation.operationId)).size === operations.length, { message: 'Un identificador de operación se repite en el lote.' });

/** Un elemento rechazado dentro de una operación parcial: referencia numérica y código, nunca nombres. */
export const syncRejectionSchema = z.object({ ref: positiveIdSchema.nullable(), code: z.string(), message: z.string() });

export const syncResultSchema = z.object({
  operationId: z.uuid(),
  status: z.enum(SYNC_RESULT_STATUSES),
  /** El servidor ya la había procesado: se devuelve el mismo acuse sin repetir el efecto. */
  replayed: z.boolean(),
  saved: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  rejections: z.array(syncRejectionSchema),
  /** Motivo cuando toda la operación se rechazó. */
  code: z.string().nullable(),
  message: z.string().nullable(),
});

export const syncResponseSchema = z.object({ results: z.array(syncResultSchema) });

export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type SyncRejection = z.infer<typeof syncRejectionSchema>;
export type SyncResult = z.infer<typeof syncResultSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
