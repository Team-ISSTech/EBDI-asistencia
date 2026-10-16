import { ABSENCE_STATUSES, FOLLOW_UP_CAUSES, FOLLOW_UP_STATUSES } from '@sirai/domain';
import { z } from 'zod';

const positiveIdSchema = z.number().int().positive();

/**
 * Ticket en la bandeja de trabajo. Trae el nombre del infante (dato personal,
 * por eso consultarlo se audita) y nunca teléfonos, notas ni datos de salud.
 */
export const followUpSchema = z.object({
  id: positiveIdSchema,
  childId: positiveIdSchema,
  childName: z.string(),
  enrollmentNumber: z.string(),
  roomName: z.string(),
  absenceDate: z.iso.date(),
  absenceStatus: z.enum(ABSENCE_STATUSES),
  status: z.enum(FOLLOW_UP_STATUSES),
  cause: z.enum(FOLLOW_UP_CAUSES).nullable(),
  expectedReturnDate: z.iso.date().nullable(),
  requiresMedicalRelease: z.boolean(),
  openedAt: z.iso.datetime(),
});

export const followUpListResponseSchema = z.object({ followUps: z.array(followUpSchema) });

export type FollowUp = z.infer<typeof followUpSchema>;
export type FollowUpListResponse = z.infer<typeof followUpListResponseSchema>;
