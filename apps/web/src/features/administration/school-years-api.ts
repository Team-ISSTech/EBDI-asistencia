import {
  type OpenSchoolYearRequest,
  type PurgeSchoolYearRequest,
  type PurgeSchoolYearResponse,
  purgeSchoolYearResponseSchema,
  type SchoolYearListResponse,
  type SchoolYearView,
  schoolYearListResponseSchema,
  schoolYearSchema,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchSchoolYears = (): Promise<SchoolYearListResponse> => apiRequest('/administracion/ciclos', { schema: schoolYearListResponseSchema });

export const openSchoolYear = (body: OpenSchoolYearRequest): Promise<SchoolYearView> =>
  apiRequest('/administracion/ciclos', { method: 'POST', body, schema: schoolYearSchema });

export const purgeSchoolYear = (id: number, body: PurgeSchoolYearRequest): Promise<PurgeSchoolYearResponse> =>
  apiRequest(`/administracion/ciclos/${id}/depurar`, { method: 'POST', body, schema: purgeSchoolYearResponseSchema });
