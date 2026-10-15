import {
  type Child,
  type ChildListResponse,
  childListResponseSchema,
  childSchema,
  type EnrollChildRequest,
  type RoomListResponse,
  roomListResponseSchema,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchChildren = (): Promise<ChildListResponse> => apiRequest('/infantes', { schema: childListResponseSchema });

export const fetchRooms = (): Promise<RoomListResponse> => apiRequest('/salas', { schema: roomListResponseSchema });

export const enrollChild = (body: EnrollChildRequest): Promise<Child> =>
  apiRequest('/infantes', { method: 'POST', body, schema: childSchema });
