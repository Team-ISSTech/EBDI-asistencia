import type { AttendanceMethod, AttendanceStatus, Shift } from '@sirai/domain';

export interface RosterRow {
  readonly enrollmentId: number;
  readonly childId: number;
  readonly childName: string;
  readonly enrollmentNumber: string;
  readonly roomId: number;
  readonly roomName: string;
  readonly status: AttendanceStatus | null;
  /** RF-29: el infante requiere alta médica y no puede marcarse Presente. */
  readonly medicalLock: boolean;
  /** S-27: hora de salida, si ya la registró. */
  readonly leftAt: Date | null;
  readonly incidentCount: number;
}

/** Inscripción activa en la estancia, con el turno de su sala. */
export interface EnrollmentForMarking {
  readonly enrollmentId: number;
  readonly roomShift: Shift;
}

export interface ExistingMark {
  readonly enrollmentId: number;
  readonly status: AttendanceStatus;
  /** S-27: con la salida registrada, el estado del día ya no cambia. */
  readonly leftAt: Date | null;
}

export interface MarkChange {
  readonly plan: 'CREATE' | 'CHANGE';
  readonly enrollmentId: number;
  readonly status: AttendanceStatus;
  readonly clientId: string;
  readonly method: AttendanceMethod;
  readonly before: AttendanceStatus | null;
}

/** Un cambio ya guardado, con el id de su registro de asistencia. */
export interface AppliedMark {
  readonly change: MarkChange;
  readonly recordId: number;
}
