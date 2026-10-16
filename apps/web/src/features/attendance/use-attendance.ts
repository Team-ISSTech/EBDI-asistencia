import type { MarkAttendanceRequest } from '@sirai/contracts';
import type { Shift } from '@sirai/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closeJourney, fetchJourney, fetchRoster, markAttendance, openJourney } from './api';

const journeyKey = (date: string, shift: Shift) => ['attendance', 'journey', date, shift] as const;
const rosterKey = (journeyId: number) => ['attendance', 'roster', journeyId] as const;

export function useJourney(date: string, shift: Shift) {
  return useQuery({ queryKey: journeyKey(date, shift), queryFn: () => fetchJourney(date, shift), retry: false });
}

export function useRoster(journeyId: number) {
  return useQuery({ queryKey: rosterKey(journeyId), queryFn: () => fetchRoster(journeyId) });
}

export function useOpenJourney(date: string, shift: Shift) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => openJourney(date, shift),
    onSuccess: () => client.invalidateQueries({ queryKey: journeyKey(date, shift) }),
  });
}

export function useCloseJourney(date: string, shift: Shift) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (journeyId: number) => closeJourney(journeyId),
    onSuccess: () => client.invalidateQueries({ queryKey: journeyKey(date, shift) }),
  });
}

export function useMarkAttendance(journeyId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkAttendanceRequest) => markAttendance(journeyId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: rosterKey(journeyId) }),
  });
}
