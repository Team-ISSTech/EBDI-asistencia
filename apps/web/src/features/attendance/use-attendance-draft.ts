import type { MarkAttendanceRequest, RosterEntry } from '@sirai/contracts';
import type { AttendanceMethod, AttendanceStatus } from '@sirai/domain';
import { useState } from 'react';
import { classifyScan, type ScanResult } from './scan';

interface DraftMark {
  readonly status: AttendanceStatus;
  /** Se conserva mientras el estado no cambie: reintentar el guardado no duplica la operación. */
  readonly clientId: string;
  /** Cómo se capturó: a mano o con lector/cámara. */
  readonly method: AttendanceMethod;
}

/** Lo marcado en pantalla y aún no guardado; el servidor solo recibe esto al guardar. */
export function useAttendanceDraft(entries: readonly RosterEntry[], pendingMarks: ReadonlyMap<number, AttendanceStatus> = new Map()) {
  const [draft, setDraft] = useState<ReadonlyMap<number, DraftMark>>(new Map());

  const statusOf = (entry: RosterEntry): AttendanceStatus | null => draft.get(entry.enrollmentId)?.status ?? pendingMarks.get(entry.enrollmentId) ?? entry.status;

  const lockedIds = new Set(entries.filter((entry) => entry.medicalLock).map((entry) => entry.enrollmentId));

  /** Con candado médico nunca se registra Presente, aunque la pantalla lo permitiera. */
  const setStatus = (enrollmentId: number, status: AttendanceStatus, method: AttendanceMethod = 'MANUAL') => {
    if (status === 'PRESENTE' && lockedIds.has(enrollmentId)) return;
    setDraft((current) => {
      const next = new Map(current);
      const previous = current.get(enrollmentId);
      next.set(enrollmentId, { status, method, clientId: previous?.status === status ? previous.clientId : crypto.randomUUID() });
      return next;
    });
  };

  /** Solo a quienes todavía no tienen estado (ni guardado en la tablet) y no tienen candado médico: no pisa un filtro sanitario ni una falta ya marcados. */
  const markAllPresent = () =>
    setDraft((current) => {
      const next = new Map(current);
      for (const entry of entries) {
        if (entry.status === null && !entry.medicalLock && !current.has(entry.enrollmentId) && !pendingMarks.has(entry.enrollmentId)) next.set(entry.enrollmentId, { status: 'PRESENTE', method: 'MANUAL', clientId: crypto.randomUUID() });
      }
      return next;
    });

  const pending = (): MarkAttendanceRequest['marks'] =>
    [...draft.entries()]
      .filter(([enrollmentId, mark]) => entries.find((entry) => entry.enrollmentId === enrollmentId)?.status !== mark.status)
      .map(([enrollmentId, mark]) => ({ enrollmentId, status: mark.status, clientId: mark.clientId, method: mark.method }));

  /** Lector, cámara o matrícula escrita: marca presente en el borrador y dice qué pasó. */
  const scan = (raw: string): ScanResult => {
    const result = classifyScan(entries, raw, statusOf);
    if (result.kind === 'marked') setStatus(result.entry.enrollmentId, 'PRESENTE', 'QR');
    return result;
  };

  return { statusOf, setStatus, scan, markAllPresent, pending, clear: () => setDraft(new Map()) };
}
