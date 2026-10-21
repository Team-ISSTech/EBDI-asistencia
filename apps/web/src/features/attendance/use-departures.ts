import type { RegisterIncidentRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAuthorizedPickups, fetchIncidents, registerDeparture, registerIncident } from './departures-api';

const rosterKey = (journeyId: number) => ['attendance', 'roster', journeyId] as const;
const incidentsKey = (journeyId: number, enrollmentId: number) => ['attendance', 'incidents', journeyId, enrollmentId] as const;

/**
 * Salida e incidencias (S-27). Solo con conexión: si no la hay, el error se
 * muestra y nada se guarda en la tablet.
 */
export function useAuthorizedPickups(journeyId: number, enrollmentId: number, enabled: boolean) {
  return useQuery({ queryKey: ['attendance', 'pickups', journeyId, enrollmentId], queryFn: () => fetchAuthorizedPickups(journeyId, enrollmentId), enabled });
}

export function useIncidents(journeyId: number, enrollmentId: number, withDetail: boolean) {
  return useQuery({ queryKey: [...incidentsKey(journeyId, enrollmentId), withDetail], queryFn: () => fetchIncidents(journeyId, enrollmentId, withDetail) });
}

export function useRegisterDeparture(journeyId: number, enrollmentId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (guardianId: number) => registerDeparture(journeyId, enrollmentId, guardianId),
    onSuccess: () => client.invalidateQueries({ queryKey: rosterKey(journeyId) }),
  });
}

export function useRegisterIncident(journeyId: number, enrollmentId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterIncidentRequest) => registerIncident(journeyId, enrollmentId, body),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: incidentsKey(journeyId, enrollmentId) }), client.invalidateQueries({ queryKey: rosterKey(journeyId) })]),
  });
}
