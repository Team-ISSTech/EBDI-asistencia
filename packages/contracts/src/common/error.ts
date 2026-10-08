import { z } from 'zod';

/** Formato único de error de la API. Los códigos son estables para la web. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
