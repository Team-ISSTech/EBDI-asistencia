import { CONSENT_TYPES } from '@sirai/domain';
import { z } from 'zod';
import { positiveIdSchema } from './common.js';

const MAX_NOTICE_VERSION = 30;

export const consentTypeSchema = z.enum(CONSENT_TYPES);

export const consentSchema = z.object({
  id: positiveIdSchema,
  childId: positiveIdSchema,
  guardianId: positiveIdSchema,
  type: consentTypeSchema,
  noticeVersion: z.string(),
  accepted: z.boolean(),
  acceptedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

/** Historial completo: la UI deduce el estado vigente con las reglas de `@sirai/domain`. */
export const consentListResponseSchema = z.object({ consents: z.array(consentSchema) });

export const registerConsentRequestSchema = z.object({
  guardianId: positiveIdSchema,
  type: consentTypeSchema,
  noticeVersion: z.string().trim().min(1).max(MAX_NOTICE_VERSION),
  accepted: z.boolean().default(true),
});

export type Consent = z.infer<typeof consentSchema>;
export type ConsentListResponse = z.infer<typeof consentListResponseSchema>;
export type RegisterConsentRequest = z.infer<typeof registerConsentRequestSchema>;
