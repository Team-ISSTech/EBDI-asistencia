import { ABSENCE_STATUSES, CONTACT_CAUSES, CONTACT_RESULTS, FOLLOW_UP_CAUSES, FOLLOW_UP_STATUSES } from '@sirai/domain';
import { z } from 'zod';

const positiveIdSchema = z.number().int().positive();
const MAX_NOTES_LENGTH = 2000;

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
  /** Intentos de contacto registrados (con o sin respuesta). */
  attemptCount: z.number().int().nonnegative(),
  /** Cuándo toca el segundo intento tras no localizar al tutor (RF-27). */
  nextAttemptAt: z.iso.datetime().nullable(),
  /** Dos intentos sin respuesta: hay que avisar a los contactos de emergencia. */
  emergencyAlert: z.boolean(),
  openedAt: z.iso.datetime(),
});

export const followUpListResponseSchema = z.object({ followUps: z.array(followUpSchema) });

const notesSchema = z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional();

/**
 * Un intento de contacto telefónico (RF-25). Si se habló con el tutor hay que
 * decir con quién, la causa y cuándo regresa el infante; si no contestó, basta
 * el intento (el sistema clasifica NO_LOC y programa el segundo).
 */
export const registerContactRequestSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal(CONTACT_RESULTS[0]),
    guardianId: positiveIdSchema,
    cause: z.enum(CONTACT_CAUSES),
    expectedReturnDate: z.iso.date(),
    notes: notesSchema,
  }),
  z.object({
    result: z.literal(CONTACT_RESULTS[1]),
    guardianId: positiveIdSchema.optional(),
    notes: notesSchema,
  }),
]);

/** Intento tal como se ve en el historial; las notas viajan descifradas solo por su ruta con permiso. */
export const contactSchema = z.object({
  id: positiveIdSchema,
  attemptNumber: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
  result: z.enum(CONTACT_RESULTS),
  guardianId: positiveIdSchema.nullable(),
  notes: z.string().nullable(),
  nextAttemptAt: z.iso.datetime().nullable(),
});

export const contactListResponseSchema = z.object({ contacts: z.array(contactSchema) });

export type FollowUp = z.infer<typeof followUpSchema>;
export type FollowUpListResponse = z.infer<typeof followUpListResponseSchema>;
export type RegisterContactRequest = z.infer<typeof registerContactRequestSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
