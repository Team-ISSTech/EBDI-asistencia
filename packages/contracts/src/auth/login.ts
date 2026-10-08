import { z } from 'zod';

/** Cuerpo de `POST /auth/login`. El correo se normaliza para comparar. */
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
