import type { AttendanceMethod, AttendanceStatus, Shift } from '@sirai/domain';

export interface RosterRow {
  readonly enrollmentId: number;
  readonly childId: number;
  readonly childName: string;
  readonly enrollmentNumber: string;
  readonly roomId: number;
  readonly roomName: string;
  readonly status: AttendanceStatus | null;
}

/** Inscripción activa en la estancia, con el turno de su sala. */
export interface EnrollmentForMarking {
  readonly enrollmentId: number;
  readonly roomShift: Shift;
}

export interface ExistingMark {
  readonly enrollmentId: number;
  readonly status: AttendanceStatus;
}

export interface MarkChange {
  readonly plan: 'CREATE' | 'CHANGE';
  readonly enrollmentId: number;
  readonly status: AttendanceStatus;
  readonly clientId: string;
  readonly method: AttendanceMethod;
  readonly before: AttendanceStatus | null;
}
