import {
  type AuditFiltersResponse,
  type AuditListResponse,
  type AuditQuery,
  auditFiltersResponseSchema,
  auditListResponseSchema,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

/** Solo viajan los filtros con valor; el resto no existe en la URL. */
const toSearch = (query: Partial<AuditQuery>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
};

export const fetchAudit = (query: Partial<AuditQuery>): Promise<AuditListResponse> =>
  apiRequest(`/auditoria${toSearch(query)}`, { schema: auditListResponseSchema });

export const fetchAuditFilters = (): Promise<AuditFiltersResponse> => apiRequest('/auditoria/filtros', { schema: auditFiltersResponseSchema });
