import { ESTANCIA_STATUSES, isValidTimeZone } from '@sirai/domain';
import { z } from 'zod';

const MAX_CODE_LENGTH = 20;
const CODE_PATTERN = /^[A-Z0-9-]+$/;

const codeSchema = z.string().trim().toUpperCase().min(1).max(MAX_CODE_LENGTH).regex(CODE_PATTERN, { message: 'Solo letras, números y guiones.' });
const nameSchema = z.string().trim().min(1).max(150);
const timeZoneSchema = z.string().trim().refine(isValidTimeZone, { message: 'Zona horaria desconocida.' });
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable();

export const estanciaStatusSchema = z.enum(ESTANCIA_STATUSES);

/** Estancia tal como la administra la oficina central (sin datos de infantes). */
export const estanciaAdminSchema = z.object({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  ur: z.string().nullable(),
  region: z.string().nullable(),
  address: z.string().nullable(),
  timeZone: z.string(),
  status: estanciaStatusSchema,
});

export const estanciaAdminListResponseSchema = z.object({ estancias: z.array(estanciaAdminSchema) });

/** Alta de una estancia (RF-31). La clave EBDI no cambia después. */
export const createEstanciaRequestSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  ur: optionalText(10).default(null),
  region: optionalText(100).default(null),
  address: optionalText(255).default(null),
  timeZone: timeZoneSchema,
});

/** Cambios parciales; el estatus INACTIVA la saca de la operación sin borrarla. */
export const updateEstanciaRequestSchema = z
  .object({
    name: nameSchema,
    ur: optionalText(10),
    region: optionalText(100),
    address: optionalText(255),
    timeZone: timeZoneSchema,
    status: estanciaStatusSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Indica al menos un cambio.' });

export type EstanciaAdmin = z.infer<typeof estanciaAdminSchema>;
export type EstanciaAdminListResponse = z.infer<typeof estanciaAdminListResponseSchema>;
export type CreateEstanciaRequest = z.infer<typeof createEstanciaRequestSchema>;
export type UpdateEstanciaRequest = z.infer<typeof updateEstanciaRequestSchema>;
