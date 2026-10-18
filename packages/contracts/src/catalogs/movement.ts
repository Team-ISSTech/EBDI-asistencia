import { z } from 'zod';
import { isoDateSchema, positiveIdSchema } from './common.js';

const MAX_REASON = 255;
const optionalReasonSchema = z.string().trim().min(1).max(MAX_REASON).nullable().default(null);
const requiredReasonSchema = z.string().trim().min(1).max(MAX_REASON);

/**
 * Movimiento manual de una inscripción activa. El ALTA no está aquí: nace con el
 * infante o con la recepción de un traslado.
 */
export const enrollmentMovementRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CAMBIO_SALA'), roomId: positiveIdSchema, reason: optionalReasonSchema }),
  z.object({ type: z.literal('BAJA'), reason: requiredReasonSchema }),
  z.object({ type: z.literal('TRASLADO'), destinationEstanciaId: positiveIdSchema, reason: requiredReasonSchema }),
]);

/** Estancias a las que se puede trasladar: solo lo necesario para elegir. */
export const transferDestinationSchema = z.object({ id: positiveIdSchema, code: z.string(), name: z.string() });
export const transferDestinationListResponseSchema = z.object({ estancias: z.array(transferDestinationSchema) });

/** Traslado que la estancia de destino todavía no recibe. */
export const pendingTransferSchema = z.object({
  enrollmentId: positiveIdSchema,
  childName: z.string(),
  enrollmentNumber: z.string(),
  birthDate: isoDateSchema,
  fromEstanciaName: z.string(),
  movedAt: z.iso.datetime(),
  reason: z.string().nullable(),
});
export const pendingTransferListResponseSchema = z.object({ transfers: z.array(pendingTransferSchema) });

export const receiveTransferRequestSchema = z.object({ roomId: positiveIdSchema });

export type EnrollmentMovementRequest = z.infer<typeof enrollmentMovementRequestSchema>;
export type TransferDestination = z.infer<typeof transferDestinationSchema>;
export type TransferDestinationListResponse = z.infer<typeof transferDestinationListResponseSchema>;
export type PendingTransfer = z.infer<typeof pendingTransferSchema>;
export type PendingTransferListResponse = z.infer<typeof pendingTransferListResponseSchema>;
export type ReceiveTransferRequest = z.infer<typeof receiveTransferRequestSchema>;
