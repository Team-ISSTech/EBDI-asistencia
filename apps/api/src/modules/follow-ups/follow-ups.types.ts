import type { AttendanceStatus, ContactResult, FollowUpCause, FollowUpStatus } from '@sirai/domain';

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
  readonly medicalReleased: boolean;
  readonly attemptCount: number;
  readonly failedAttempts: number;
  /** Próximo intento programado por el último contacto fallido; nulo si no hay. */
  readonly nextAttemptAt: Date | null;
  readonly openedAt: Date;
}

/** Lo que hace falta del ticket para decidir qué provoca un nuevo contacto. */
export interface FollowUpDetail {
  readonly id: number;
  readonly childId: number;
  readonly status: FollowUpStatus;
  readonly cause: FollowUpCause | null;
  readonly requiresMedicalRelease: boolean;
  readonly expectedReturnDate: string | null;
  readonly released: boolean;
  readonly attemptCount: number;
  readonly failedAttempts: number;
}

export interface NewContact {
  readonly attemptNumber: number;
  readonly guardianId: number | null;
  readonly result: ContactResult;
  /** Ya cifrados por el servicio: el repositorio nunca ve el texto claro. */
  readonly phoneEncrypted: Buffer | null;
  readonly notesEncrypted: Buffer | null;
  readonly nextAttemptAt: Date | null;
  /** UUID de la operación sin conexión que lo creó; nulo si se registró en línea. */
  readonly operationId: string | null;
  /** RF-27: contactos de emergencia a los que se deja un aviso pendiente junto con este intento. */
  readonly emergencyGuardianIds: readonly number[];
}

export interface TicketChange {
  readonly status: FollowUpStatus;
  readonly cause: FollowUpCause | null;
  readonly requiresMedicalRelease: boolean;
  readonly expectedReturnDate: string | null;
}

export interface ContactRow {
  readonly id: number;
  readonly attemptNumber: number;
  readonly occurredAt: Date;
  readonly result: ContactResult;
  readonly guardianId: number | null;
  readonly notesEncrypted: Buffer | null;
  readonly nextAttemptAt: Date | null;
}

export interface NewRelease {
  readonly dischargeDate: string;
  readonly folio: string | null;
  /** Ya cifradas por el servicio: son datos de salud. */
  readonly observationsEncrypted: Buffer | null;
}
