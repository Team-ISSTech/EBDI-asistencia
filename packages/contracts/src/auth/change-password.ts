import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@sirai/domain';
import { z } from 'zod';

/** Cuerpo de `POST /auth/contrasena`: la actual (o la temporal) y la nueva. */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z
    .string()
    .max(PASSWORD_MAX_LENGTH)
    .refine((value) => value.trim().length >= PASSWORD_MIN_LENGTH, { message: `La contraseña nueva debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.` }),
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
