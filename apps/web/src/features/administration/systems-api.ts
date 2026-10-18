import {
  type CreatedSystemResponse,
  type CreateSystemRequest,
  createdSystemResponseSchema,
  type SystemListResponse,
  systemListResponseSchema,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchSystems = (): Promise<SystemListResponse> => apiRequest('/administracion/sistemas', { schema: systemListResponseSchema });

export const createSystem = (body: CreateSystemRequest): Promise<CreatedSystemResponse> =>
  apiRequest('/administracion/sistemas', { method: 'POST', body, schema: createdSystemResponseSchema });

export const revokeSystem = (id: number): Promise<void> => apiRequest(`/administracion/sistemas/${id}/revocar`, { method: 'POST' });
