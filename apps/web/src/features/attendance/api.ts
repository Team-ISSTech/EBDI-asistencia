import {
  type AttendanceJourney,
  attendanceJourneySchema,
  type MarkAttendanceRequest,
  type MarkAttendanceResponse,
  markAttendanceResponseSchema,
  type RosterResponse,
  rosterResponseSchema,
} from '@sirai/contracts';
import type { Shift } from '@sirai/domain';
import { ApiClientError, apiRequest } from '../../lib/api-client';

/** `null` cuando no hay jornada abierta para ese día y turno (la API responde 404). */
export async function fetchJourney(date: string, shift: Shift): Promise<AttendanceJourney | null> {
  try {
    return await apiRequest(`/asistencia/jornadas/activa?date=${date}&shift=${shift}`, { schema: attendanceJourneySchema });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

export const openJourney = (date: string, shift: Shift): Promise<AttendanceJourney> =>
  apiRequest('/asistencia/jornadas', { method: 'POST', body: { date, shift }, schema: attendanceJourneySchema });

export const closeJourney = (journeyId: number): Promise<AttendanceJourney> =>
  apiRequest(`/asistencia/jornadas/${journeyId}/cierre`, { method: 'POST', schema: attendanceJourneySchema });

export const fetchRoster = (journeyId: number): Promise<RosterResponse> =>
  apiRequest(`/asistencia/jornadas/${journeyId}/lista`, { schema: rosterResponseSchema });

export const markAttendance = (journeyId: number, body: MarkAttendanceRequest): Promise<MarkAttendanceResponse> =>
  apiRequest(`/asistencia/jornadas/${journeyId}/registros`, { method: 'POST', body, schema: markAttendanceResponseSchema });
