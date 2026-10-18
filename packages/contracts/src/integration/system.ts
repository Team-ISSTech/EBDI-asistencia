import { INTEGRATION_SCOPES } from '@sirai/auth';
import { z } from 'zod';

const CLIENT_ID_LENGTH = 32;
const MAX_NAME = 100;
const MAX_SECRET = 200;

export const SYSTEM_STATUSES = ['ACTIVO', 'REVOCADO'] as const;

export const integrationScopeSchema = z.enum(INTEGRATION_SCOPES);

export const createSystemRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME),
  scopes: z
    .array(integrationScopeSchema)
    .min(1)
    .refine((list) => new Set(list).size === list.length, { message: 'Hay alcances repetidos.' }),
});

/** Un sistema externo. Nunca lleva el secreto: ese solo existe con hash y se muestra una vez al crearlo. */
export const systemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  clientId: z.string().length(CLIENT_ID_LENGTH),
  scopes: z.array(integrationScopeSchema),
  status: z.enum(SYSTEM_STATUSES),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export const systemListResponseSchema = z.object({ systems: z.array(systemSchema) });

/** El secreto se entrega aquí y en ningún otro lugar: si se pierde, se registra un sistema nuevo. */
export const createdSystemResponseSchema = z.object({ system: systemSchema, clientSecret: z.string().min(1) });

/** Cuerpo de `POST /integracion/token`: las credenciales de máquina del sistema. */
export const integrationTokenRequestSchema = z.object({
  clientId: z.string().regex(/^[0-9a-f]{32}$/i),
  clientSecret: z.string().min(1).max(MAX_SECRET),
});

export const integrationTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  /** Segundos de vida del token. */
  expiresIn: z.number().int().positive(),
  /** Alcances concedidos, separados por espacio. */
  scope: z.string(),
});

export type CreateSystemRequest = z.infer<typeof createSystemRequestSchema>;
export type SystemView = z.infer<typeof systemSchema>;
export type SystemListResponse = z.infer<typeof systemListResponseSchema>;
export type CreatedSystemResponse = z.infer<typeof createdSystemResponseSchema>;
export type IntegrationTokenRequest = z.infer<typeof integrationTokenRequestSchema>;
export type IntegrationTokenResponse = z.infer<typeof integrationTokenResponseSchema>;
