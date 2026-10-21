import { INCIDENT_TYPES, MAX_INCIDENT_DESCRIPTION } from '@sirai/domain';
import { z } from 'zod';

const positiveIdSchema = z.number().int().positive();

/** S-27: la salida la hace un tutor autorizado a recoger, elegido de la lista. */
export const registerDepartureRequestSchema = z.object({ guardianId: positiveIdSchema });

export const registerDepartureResponseSchema = z.object({ leftAt: z.iso.datetime() });

/** Solo lo necesario en la puerta: ni teléfono ni identificación. */
export const authorizedPickupSchema = z.object({ id: positiveIdSchema, name: z.string(), relationship: z.string() });

export const authorizedPickupsResponseSchema = z.object({ guardians: z.array(authorizedPickupSchema) });

export const incidentTypeSchema = z.enum(INCIDENT_TYPES);

export const registerIncidentRequestSchema = z.object({
  type: incidentTypeSchema,
  description: z.string().trim().min(1).max(MAX_INCIDENT_DESCRIPTION),
});

/** `description` viene en null para quien no tiene permiso de leer notas sensibles. */
export const incidentSchema = z.object({
  id: positiveIdSchema,
  type: incidentTypeSchema,
  description: z.string().nullable(),
  recordedAt: z.iso.datetime(),
});

export const incidentListResponseSchema = z.object({ incidents: z.array(incidentSchema) });

export type RegisterDepartureRequest = z.infer<typeof registerDepartureRequestSchema>;
export type RegisterDepartureResponse = z.infer<typeof registerDepartureResponseSchema>;
export type AuthorizedPickup = z.infer<typeof authorizedPickupSchema>;
export type AuthorizedPickupsResponse = z.infer<typeof authorizedPickupsResponseSchema>;
export type RegisterIncidentRequest = z.infer<typeof registerIncidentRequestSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type IncidentListResponse = z.infer<typeof incidentListResponseSchema>;
