import type { MarkAttendanceRequest, RosterEntry } from '@sirai/contracts';
import type { AttendanceStatus } from '@sirai/domain';
import { useState } from 'react';

interface DraftMark {
  readonly status: AttendanceStatus;
  /** Se conserva mientras el estado no cambie: reintentar el guardado no duplica la operación. */
  readonly clientId: string;
}

/** Lo marcado en pantalla y aún no guardado; el servidor solo recibe esto al guardar. */
export function useAttendanceDraft(entries: readonly RosterEntry[]) {
  const [draft, setDraft] = useState<ReadonlyMap<number, DraftMark>>(new Map());

  const statusOf = (entry: RosterEntry): AttendanceStatus | null => draft.get(entry.enrollmentId)?.status ?? entry.status;

  const lockedIds = new Set(entries.filter((entry) => entry.medicalLock).map((entry) => entry.enrollmentId));

  /** Con candado médico nunca se registra Presente, aunque la pantalla lo permitiera. */
  const setStatus = (enrollmentId: number, status: AttendanceStatus) => {
    if (status === 'PRESENTE' && lockedIds.has(enrollmentId)) return;
    setDraft((current) => {
      const next = new Map(current);
      const previous = current.get(enrollmentId);
      next.set(enrollmentId, { status, clientId: previous?.status === status ? previous.clientId : crypto.randomUUID() });
      return next;
    });
  };

  /** Solo a quienes todavía no tienen estado y no tienen candado médico: no pisa un filtro sanitario ni una falta ya marcados. */
  const markAllPresent = () =>
    setDraft((current) => {
      const next = new Map(current);
      for (const entry of entries) {
        if (entry.status === null && !entry.medicalLock && !current.has(entry.enrollmentId)) next.set(entry.enrollmentId, { status: 'PRESENTE', clientId: crypto.randomUUID() });
      }
      return next;
    });

  const pending = (): MarkAttendanceRequest['marks'] =>
    [...draft.entries()]
      .filter(([enrollmentId, mark]) => entries.find((entry) => entry.enrollmentId === enrollmentId)?.status !== mark.status)
      .map(([enrollmentId, mark]) => ({ enrollmentId, status: mark.status, clientId: mark.clientId, method: 'MANUAL' as const }));

  return { statusOf, setStatus, markAllPresent, pending, clear: () => setDraft(new Map()) };
}
