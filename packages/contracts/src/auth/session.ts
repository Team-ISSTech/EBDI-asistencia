import { PERMISSION_CODES, ROLE_CODES } from '@sirai/auth';
import { z } from 'zod';

const positiveIdSchema = z.number().int().positive();

export const roleCodeSchema = z.enum(ROLE_CODES);
export const permissionCodeSchema = z.enum(PERMISSION_CODES);

/** Asignación de rol tal como se expone a la web (incluye nombre de estancia). */
export const assignmentViewSchema = z.object({
  role: roleCodeSchema,
  estanciaId: positiveIdSchema.nullable(),
  estanciaName: z.string().nullable(),
});

export const estanciaSummarySchema = z.object({
  id: positiveIdSchema,
  name: z.string(),
});

/** Respuesta de `GET /auth/me` y de `POST /auth/login`. */
export const sessionResponseSchema = z.object({
  user: z.object({ id: positiveIdSchema, name: z.string(), email: z.email() }),
  assignments: z.array(assignmentViewSchema),
  activeEstancia: estanciaSummarySchema.nullable(),
  /** Estancias que la sesión puede activar: las asignadas o todas para roles centrales. */
  availableEstancias: z.array(estanciaSummarySchema),
  permissions: z.array(permissionCodeSchema),
});

export type AssignmentView = z.infer<typeof assignmentViewSchema>;
export type EstanciaSummary = z.infer<typeof estanciaSummarySchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
