import {
  type CreateEstanciaRequest,
  type EstanciaAdmin,
  type EstanciaAdminListResponse,
  estanciaAdminListResponseSchema,
  estanciaAdminSchema,
  type UpdateEstanciaRequest,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchEstancias = (): Promise<EstanciaAdminListResponse> => apiRequest('/administracion/estancias', { schema: estanciaAdminListResponseSchema });

export const createEstancia = (body: CreateEstanciaRequest): Promise<EstanciaAdmin> =>
  apiRequest('/administracion/estancias', { method: 'POST', body, schema: estanciaAdminSchema });

export const updateEstancia = (id: number, body: UpdateEstanciaRequest): Promise<EstanciaAdmin> =>
  apiRequest(`/administracion/estancias/${id}`, { method: 'PATCH', body, schema: estanciaAdminSchema });

export const retireEstancia = (id: number): Promise<void> => apiRequest(`/administracion/estancias/${id}/baja`, { method: 'POST' });
