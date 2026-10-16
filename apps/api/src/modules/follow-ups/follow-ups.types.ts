import type { AttendanceStatus, FollowUpCause, FollowUpStatus } from '@sirai/domain';

/** Ausencia registrada que todavía no tiene ticket. */
export interface AbsenceCandidate {
  readonly recordId: number;
  readonly estanciaId: number;
  readonly journeyDate: string;
  readonly timeZone: string;
}

export interface FollowUpRow {
  readonly id: number;
  readonly childId: number;
  readonly childName: string;
  readonly enrollmentNumber: string;
  readonly roomName: string;
  readonly absenceDate: string;
  readonly absenceStatus: Extract<AttendanceStatus, 'AUSENTE_JUSTIFICADO' | 'FALTA_INJUSTIFICADA'>;
  readonly status: FollowUpStatus;
  readonly cause: FollowUpCause | null;
  readonly expectedReturnDate: string | null;
  readonly requiresMedicalRelease: boolean;
  readonly openedAt: Date;
}
