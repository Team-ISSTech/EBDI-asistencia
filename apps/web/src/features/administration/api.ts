import {
  type CreateUserRequest,
  type ReplaceRolesRequest,
  type User,
  type UserListResponse,
  userListResponseSchema,
  userSchema,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchUsers = (): Promise<UserListResponse> => apiRequest('/usuarios', { schema: userListResponseSchema });

export const createUser = (body: CreateUserRequest): Promise<User> =>
  apiRequest('/usuarios', { method: 'POST', body, schema: userSchema });

export const replaceRoles = (userId: number, body: ReplaceRolesRequest): Promise<User> =>
  apiRequest(`/usuarios/${userId}/roles`, { method: 'PATCH', body, schema: userSchema });
