import {
  type Child,
  type ChildGuardian,
  type ChildGuardianListResponse,
  type ChildListResponse,
  type CreateGuardianRequest,
  childGuardianListResponseSchema,
  childGuardianSchema,
  childListResponseSchema,
  childSchema,
  type EnrollChildRequest,
  type Guardian,
  type GuardianPhoneResponse,
  guardianPhoneResponseSchema,
  guardianSchema,
  type LinkGuardianRequest,
  type RoomListResponse,
  roomListResponseSchema,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchChildren = (): Promise<ChildListResponse> => apiRequest('/infantes', { schema: childListResponseSchema });

export const fetchRooms = (): Promise<RoomListResponse> => apiRequest('/salas', { schema: roomListResponseSchema });

export const enrollChild = (body: EnrollChildRequest): Promise<Child> =>
  apiRequest('/infantes', { method: 'POST', body, schema: childSchema });

export const fetchChildGuardians = (childId: number): Promise<ChildGuardianListResponse> =>
  apiRequest(`/infantes/${childId}/tutores`, { schema: childGuardianListResponseSchema });

export const createGuardian = (body: CreateGuardianRequest): Promise<Guardian> =>
  apiRequest('/tutores', { method: 'POST', body, schema: guardianSchema });

export const linkGuardian = (childId: number, body: LinkGuardianRequest): Promise<ChildGuardian> =>
  apiRequest(`/infantes/${childId}/tutores`, { method: 'POST', body, schema: childGuardianSchema });

export const fetchGuardianPhone = (guardianId: number): Promise<GuardianPhoneResponse> =>
  apiRequest(`/tutores/${guardianId}/telefono`, { schema: guardianPhoneResponseSchema });
