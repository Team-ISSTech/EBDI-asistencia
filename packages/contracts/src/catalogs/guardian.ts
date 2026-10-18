import { z } from 'zod';
import { hasChange, isoDateSchema, NO_CHANGE, positiveIdSchema } from './common.js';

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

/** Tutor tal como se ve dentro de un infante: con su parentesco y permisos. */
export const childGuardianSchema = guardianSchema.extend({
  relationship: z.string(),
  isPrimary: z.boolean(),
  canPickUp: z.boolean(),
  isEmergencyContact: z.boolean(),
  validFrom: isoDateSchema,
  validUntil: isoDateSchema.nullable(),
});

export const childGuardianListResponseSchema = z.object({ guardians: z.array(childGuardianSchema) });

/** Respuesta de la consulta explícita (y auditada) del teléfono. */
export const guardianPhoneResponseSchema = z.object({ phone: z.string().length(PHONE_DIGITS) });

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

/** Cambios parciales de un tutor; si llega un teléfono nuevo se vuelve a cifrar. */
export const updateGuardianRequestSchema = z
  .object({
    name: nameSchema,
    paternalSurname: nameSchema,
    maternalSurname: nameSchema.nullable(),
    idType: createGuardianRequestSchema.shape.idType.unwrap(),
    idFolio: createGuardianRequestSchema.shape.idFolio.unwrap(),
    phone: phoneSchema,
    email: createGuardianRequestSchema.shape.email.unwrap(),
  })
  .partial()
  .refine(hasChange, NO_CHANGE);

/** Permisos y vigencia del vínculo; el tutor y el infante del vínculo no cambian. */
export const updateGuardianLinkRequestSchema = z
  .object({
    relationship: z.string().trim().min(1).max(50),
    isPrimary: z.boolean(),
    canPickUp: z.boolean(),
    isEmergencyContact: z.boolean(),
    validUntil: isoDateSchema.nullable(),
  })
  .partial()
  .refine(hasChange, NO_CHANGE);

export type Guardian = z.infer<typeof guardianSchema>;
export type ChildGuardian = z.infer<typeof childGuardianSchema>;
export type ChildGuardianListResponse = z.infer<typeof childGuardianListResponseSchema>;
export type GuardianPhoneResponse = z.infer<typeof guardianPhoneResponseSchema>;
export type CreateGuardianRequest = z.infer<typeof createGuardianRequestSchema>;
export type LinkGuardianRequest = z.infer<typeof linkGuardianRequestSchema>;
export type UpdateGuardianRequest = z.infer<typeof updateGuardianRequestSchema>;
export type UpdateGuardianLinkRequest = z.infer<typeof updateGuardianLinkRequestSchema>;
