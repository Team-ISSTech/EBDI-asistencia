import { CHILD_STATUSES } from '@sirai/domain';
import { z } from 'zod';
import { isoDateSchema, positiveIdSchema } from './common.js';

const CURP_FORMAT = /^[A-Z]{4}\d{6}[HMX][A-Z]{2}[A-Z]{3}[A-Z\d]\d$/;
const todayIso = (): string => new Date().toISOString().slice(0, 10);

const nameSchema = z.string().trim().min(1).max(100);
const optionalNameSchema = z.string().trim().min(1).max(100).nullable().default(null);

/**
 * Vista del infante para listados: no incluye el grupo de discapacidad, que
 * es un dato de salud cifrado y solo viaja en la solicitud de alta.
 */
export const childSchema = z.object({
  id: positiveIdSchema,
  enrollmentNumber: z.string(),
  name: z.string(),
  paternalSurname: z.string(),
  maternalSurname: z.string().nullable(),
  birthDate: isoDateSchema,
  hasDisability: z.boolean(),
  status: z.enum(CHILD_STATUSES),
  roomId: positiveIdSchema,
  roomName: z.string(),
});

export const childListResponseSchema = z.object({ children: z.array(childSchema) });

const childFields = {
  enrollmentNumber: z.string().trim().min(1).max(20),
  curp: z.string().trim().toUpperCase().regex(CURP_FORMAT).nullable().default(null),
  name: nameSchema,
  paternalSurname: nameSchema,
  maternalSurname: optionalNameSchema,
  birthDate: isoDateSchema.refine((date) => date <= todayIso(), { message: 'La fecha de nacimiento no puede ser futura.' }),
  gender: z.string().trim().min(1).max(20).nullable().default(null),
  hasDisability: z.boolean().default(false),
  disabilityGroup: z.string().trim().min(1).max(100).nullable().default(null),
};

const disabilityRule = {
  check: ({ hasDisability, disabilityGroup }: { hasDisability: boolean; disabilityGroup: string | null }) =>
    hasDisability || disabilityGroup === null,
  options: { message: 'El grupo de discapacidad solo aplica si el infante tiene discapacidad.', path: ['disabilityGroup'] },
};

export const createChildRequestSchema = z.object(childFields).refine(disabilityRule.check, disabilityRule.options);

/** Alta de un infante con su inscripción inicial en una sala de la estancia activa. */
export const enrollChildRequestSchema = z
  .object({ ...childFields, roomId: positiveIdSchema })
  .refine(disabilityRule.check, disabilityRule.options);

export type Child = z.infer<typeof childSchema>;
export type ChildListResponse = z.infer<typeof childListResponseSchema>;
export type CreateChildRequest = z.infer<typeof createChildRequestSchema>;
export type EnrollChildRequest = z.infer<typeof enrollChildRequestSchema>;
