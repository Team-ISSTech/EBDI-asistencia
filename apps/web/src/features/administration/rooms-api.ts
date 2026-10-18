import {
  type CreateRoomRequest,
  type RoomAdmin,
  type RoomAdminListResponse,
  roomAdminListResponseSchema,
  roomAdminSchema,
  type UpdateRoomRequest,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchAdminRooms = (): Promise<RoomAdminListResponse> => apiRequest('/administracion/salas', { schema: roomAdminListResponseSchema });

export const createRoom = (body: CreateRoomRequest): Promise<RoomAdmin> =>
  apiRequest('/administracion/salas', { method: 'POST', body, schema: roomAdminSchema });

export const updateRoom = (id: number, body: UpdateRoomRequest): Promise<RoomAdmin> =>
  apiRequest(`/administracion/salas/${id}`, { method: 'PATCH', body, schema: roomAdminSchema });

export const retireRoom = (id: number): Promise<void> => apiRequest(`/administracion/salas/${id}/baja`, { method: 'POST' });
