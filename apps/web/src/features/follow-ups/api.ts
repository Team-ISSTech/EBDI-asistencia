import {
  type Contact,
  type ContactListResponse,
  contactListResponseSchema,
  type FollowUp,
  type FollowUpListResponse,
  followUpListResponseSchema,
  followUpSchema,
  type RegisterContactRequest,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchFollowUps = (): Promise<FollowUpListResponse> => apiRequest('/seguimientos', { schema: followUpListResponseSchema });

export const fetchContacts = (followUpId: number): Promise<ContactListResponse> =>
  apiRequest(`/seguimientos/${followUpId}/contactos`, { schema: contactListResponseSchema });

export const registerContact = (followUpId: number, body: RegisterContactRequest): Promise<FollowUp> =>
  apiRequest(`/seguimientos/${followUpId}/contactos`, { method: 'POST', body, schema: followUpSchema });

export type { Contact };
