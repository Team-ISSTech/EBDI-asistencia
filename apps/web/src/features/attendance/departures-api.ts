import {
  type AuthorizedPickupsResponse,
  authorizedPickupsResponseSchema,
  type Incident,
  type IncidentListResponse,
  incidentListResponseSchema,
  incidentSchema,
  type RegisterDepartureResponse,
  type RegisterIncidentRequest,
  registerDepartureResponseSchema,
} from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

const recordPath = (journeyId: number, enrollmentId: number): string => `/asistencia/jornadas/${journeyId}/registros/${enrollmentId}`;

export const fetchAuthorizedPickups = (journeyId: number, enrollmentId: number): Promise<AuthorizedPickupsResponse> =>
  apiRequest(`${recordPath(journeyId, enrollmentId)}/autorizados`, { schema: authorizedPickupsResponseSchema });

export const registerDeparture = (journeyId: number, enrollmentId: number, guardianId: number): Promise<RegisterDepartureResponse> =>
  apiRequest(`${recordPath(journeyId, enrollmentId)}/salida`, { method: 'POST', body: { guardianId }, schema: registerDepartureResponseSchema });

/** Con permiso de notas sensibles se pide la versión con descripción, que queda auditada. */
export const fetchIncidents = (journeyId: number, enrollmentId: number, withDetail: boolean): Promise<IncidentListResponse> =>
  apiRequest(`${recordPath(journeyId, enrollmentId)}/incidencias${withDetail ? '/detalle' : ''}`, { schema: incidentListResponseSchema });

export const registerIncident = (journeyId: number, enrollmentId: number, body: RegisterIncidentRequest): Promise<Incident> =>
  apiRequest(`${recordPath(journeyId, enrollmentId)}/incidencias`, { method: 'POST', body, schema: incidentSchema });
