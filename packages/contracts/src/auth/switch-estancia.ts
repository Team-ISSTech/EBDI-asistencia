import { z } from 'zod';

/** Cuerpo de `POST /auth/estancia`: la estancia que la sesión usará. */
export const switchEstanciaRequestSchema = z.object({
  estanciaId: z.number().int().positive(),
});

export type SwitchEstanciaRequest = z.infer<typeof switchEstanciaRequestSchema>;
