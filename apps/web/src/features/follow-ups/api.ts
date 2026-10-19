import {
  type Contact,
  type ContactListResponse,
  contactListResponseSchema,
  type FollowUp,
  type FollowUpListResponse,
  followUpListResponseSchema,
  followUpSchema,
  type RegisterContactRequest,
  type RegisterMedicalReleaseRequest,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

/** Con una conexión débil es mejor guardar en la tablet y reintentar que dejar la captura colgada. */
const CAPTURE_TIMEOUT_MS = 15_000;

export const fetchFollowUps = (): Promise<FollowUpListResponse> => apiRequest('/seguimientos', { schema: followUpListResponseSchema });

export const fetchContacts = (followUpId: number): Promise<ContactListResponse> =>
  apiRequest(`/seguimientos/${followUpId}/contactos`, { schema: contactListResponseSchema });

export const registerContact = (followUpId: number, body: RegisterContactRequest): Promise<FollowUp> =>
  apiRequest(`/seguimientos/${followUpId}/contactos`, { method: 'POST', body, schema: followUpSchema, timeoutMs: CAPTURE_TIMEOUT_MS });

export const registerRelease = (followUpId: number, body: RegisterMedicalReleaseRequest): Promise<FollowUp> =>
  apiRequest(`/seguimientos/${followUpId}/alta`, { method: 'POST', body, schema: followUpSchema });

export const closeFollowUp = (followUpId: number): Promise<FollowUp> =>
  apiRequest(`/seguimientos/${followUpId}/cierre`, { method: 'POST', schema: followUpSchema });

export type { Contact };
