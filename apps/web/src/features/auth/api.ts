import { type ChangePasswordRequest, type LoginRequest, type SessionResponse, sessionResponseSchema } from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const login = (body: LoginRequest): Promise<SessionResponse> =>
  apiRequest('/auth/login', { method: 'POST', body, schema: sessionResponseSchema });

export const fetchSession = (): Promise<SessionResponse> => apiRequest('/auth/me', { schema: sessionResponseSchema });

export const logout = (): Promise<undefined> => apiRequest('/auth/logout', { method: 'POST' });

export const switchEstancia = (estanciaId: number): Promise<SessionResponse> =>
  apiRequest('/auth/estancia', { method: 'POST', body: { estanciaId }, schema: sessionResponseSchema });

export const changePassword = (body: ChangePasswordRequest): Promise<SessionResponse> =>
  apiRequest('/auth/contrasena', { method: 'POST', body, schema: sessionResponseSchema });
