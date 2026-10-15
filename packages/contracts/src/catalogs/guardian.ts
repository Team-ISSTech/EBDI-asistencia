import { z } from 'zod';
import { isoDateSchema, positiveIdSchema } from './common.js';

const PHONE_DIGITS = 10;
const nameSchema = z.string().trim().min(1).max(100);

/** El teléfono llega en cualquier formato y se normaliza a diez dígitos. */
const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().length(PHONE_DIGITS));

/** Vista del tutor: sin teléfono; el número cifrado no sale en listados. */
export const guardianSchema = z.object({
  id: positiveIdSchema,
  name: z.string(),
  paternalSurname: z.string(),
  maternalSurname: z.string().nullable(),
  hasPhone: z.boolean(),
});

export const createGuardianRequestSchema = z.object({
  name: nameSchema,
  paternalSurname: nameSchema,
  maternalSurname: nameSchema.nullable().default(null),
  idType: z.string().trim().min(1).max(30).nullable().default(null),
  idFolio: z.string().trim().min(1).max(100).nullable().default(null),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(190)).nullable().default(null),
});

/** Vínculo infante-tutor con sus permisos operativos. */
export const linkGuardianRequestSchema = z
  .object({
    guardianId: positiveIdSchema,
    relationship: z.string().trim().min(1).max(50),
    isPrimary: z.boolean().default(false),
    canPickUp: z.boolean().default(false),
    isEmergencyContact: z.boolean().default(false),
    validFrom: isoDateSchema,
    validUntil: isoDateSchema.nullable().default(null),
  })
  .refine(({ validFrom, validUntil }) => validUntil === null || validUntil >= validFrom, {
    message: 'La vigencia no puede terminar antes de empezar.',
    path: ['validUntil'],
  });

export type Guardian = z.infer<typeof guardianSchema>;
export type CreateGuardianRequest = z.infer<typeof createGuardianRequestSchema>;
export type LinkGuardianRequest = z.infer<typeof linkGuardianRequestSchema>;
