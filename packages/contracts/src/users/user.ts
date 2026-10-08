import { CENTRAL_ROLE_CODES } from '@sirai/auth';
import { z } from 'zod';
import { roleCodeSchema } from '../auth/session.js';

const positiveIdSchema = z.number().int().positive();
const MIN_PASSWORD_LENGTH = 10;

export const USER_STATUSES = ['ACTIVO', 'INACTIVO'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);

/**
 * Asignación coherente: los roles centrales no llevan estancia y los roles
 * de estancia la exigen. Se valida en el contrato para fallar temprano.
 */
export const assignmentInputSchema = z
  .object({ role: roleCodeSchema, estanciaId: positiveIdSchema.nullable() })
  .refine(
    ({ role, estanciaId }) => CENTRAL_ROLE_CODES.includes(role) === (estanciaId === null),
    { message: 'Los roles centrales no llevan estancia; los demás la requieren.' },
  );

const assignmentKey = (a: { role: string; estanciaId: number | null }): string => `${a.role}:${a.estanciaId ?? 'global'}`;

/** Lista de asignaciones sin repetidos (mismo rol y misma estancia). */
export const assignmentListSchema = z
  .array(assignmentInputSchema)
  .refine((list) => new Set(list.map(assignmentKey)).size === list.length, { message: 'Hay asignaciones repetidas.' });

export const userSchema = z.object({
  id: positiveIdSchema,
  name: z.string(),
  email: z.email(),
  status: userStatusSchema,
  assignments: z.array(assignmentInputSchema),
  lastAccessAt: z.iso.datetime().nullable(),
});

export const userListResponseSchema = z.object({ users: z.array(userSchema) });

export const createUserRequestSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(190)),
  temporaryPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  assignments: assignmentListSchema,
});

export const replaceRolesRequestSchema = z.object({
  assignments: assignmentListSchema,
});

export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type User = z.infer<typeof userSchema>;
export type UserListResponse = z.infer<typeof userListResponseSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type ReplaceRolesRequest = z.infer<typeof replaceRolesRequestSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
