import { parseDossierFolio } from '@sirai/domain';
import { z } from 'zod';

const SEAL_PATTERN = /^[0-9a-f]{64}$/;

/** Verificación de un expediente recibido: folio y sello impresos en el PDF. */
export const verifyDossierRequestSchema = z.object({
  folio: z.string().trim().refine((folio) => parseDossierFolio(folio) !== null, { message: 'Folio con formato inválido.' }),
  seal: z.string().trim().toLowerCase().regex(SEAL_PATTERN),
});

/**
 * Un expediente auténtico revela cuándo y dónde se emitió; nunca datos del
 * infante. Uno que no coincide no dice por qué (no distingue folio inexistente
 * de sello falso).
 */
export const verifyDossierResponseSchema = z.discriminatedUnion('valid', [
  z.object({ valid: z.literal(true), issuedAt: z.iso.datetime(), originEstancia: z.string() }),
  z.object({ valid: z.literal(false) }),
]);

export type VerifyDossierRequest = z.infer<typeof verifyDossierRequestSchema>;
export type VerifyDossierResponse = z.infer<typeof verifyDossierResponseSchema>;
