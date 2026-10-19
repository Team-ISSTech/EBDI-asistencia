import type { MarkAttendanceRequest } from '@sirai/contracts';
import type { AttendanceStatus, Shift } from '@sirai/domain';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOfflineOptional } from '../../offline/offline-api';
import { saveOrQueue } from '../../offline/save-or-queue';
import { closeJourney, fetchJourney, fetchRoster, markAttendance, openJourney } from './api';

const journeyKey = (date: string, shift: Shift) => ['attendance', 'journey', date, shift] as const;
const rosterKey = (journeyId: number) => ['attendance', 'roster', journeyId] as const;
const pendingMarksKey = (journeyId: number) => ['offline', 'pending-marks', journeyId] as const;

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

/**
 * Guarda la asistencia en el servidor y, si no hay conexión, en la tablet para enviarla sola
 * (RF-20 a RF-23). El resultado dice cuál de las dos cosas pasó.
 */
export function useSaveAttendance(journeyId: number) {
  const client = useQueryClient();
  const offline = useOfflineOptional();
  return useMutation({
    mutationFn: (body: MarkAttendanceRequest) =>
      saveOrQueue(
        () => markAttendance(journeyId, body),
        offline ? () => offline.enqueue({ type: 'ATTENDANCE_MARKS', payload: { journeyId, marks: body.marks } }) : null,
      ),
    onSuccess: (result, body) => {
      // Lo guardado en la tablet se ve de inmediato, sin esperar a releer la cola.
      if (result.queued) client.setQueriesData<ReadonlyMap<number, AttendanceStatus>>({ queryKey: pendingMarksKey(journeyId) }, (previous) => new Map([...(previous ?? NO_MARKS), ...body.marks.map((mark) => [mark.enrollmentId, mark.status] as const)]));
      return client.invalidateQueries({ queryKey: rosterKey(journeyId) });
    },
  });
}

const NO_MARKS: ReadonlyMap<number, AttendanceStatus> = new Map();

/** Lo marcado en esta jornada que está guardado en la tablet y aún no llega al servidor. */
export function usePendingMarks(journeyId: number): ReadonlyMap<number, AttendanceStatus> {
  const offline = useOfflineOptional();
  const query = useQuery({
    // La lista se vuelve a leer cuando cambia lo que hay en la cola.
    queryKey: [...pendingMarksKey(journeyId), offline?.counts.pending ?? 0],
    queryFn: () => (offline ? offline.pendingMarks(journeyId) : Promise.resolve(NO_MARKS)),
    enabled: offline !== null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  return query.data ?? NO_MARKS;
}
