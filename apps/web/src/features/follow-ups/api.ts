import { type FollowUpListResponse, followUpListResponseSchema } from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchFollowUps = (): Promise<FollowUpListResponse> => apiRequest('/seguimientos', { schema: followUpListResponseSchema });
