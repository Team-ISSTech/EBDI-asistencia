import type { AttendanceStatus } from './attendance.js';

export const FOLLOW_UP_CAUSES = ['ENF_CASA', 'ACC_EXT', 'PER_TUT', 'NO_LOC'] as const;
export type FollowUpCause = (typeof FOLLOW_UP_CAUSES)[number];

/** ABIERTO: sin causa aún; CLASIFICADO: con causa y fecha de retorno; CERRADO: caso terminado. */
export const FOLLOW_UP_STATUSES = ['ABIERTO', 'CLASIFICADO', 'CERRADO'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/** S-08: solo estas ausencias generan ticket; comisión médica y filtro sanitario no. */
export const ABSENCE_STATUSES = ['AUSENTE_JUSTIFICADO', 'FALTA_INJUSTIFICADA'] as const satisfies readonly AttendanceStatus[];

export const generatesFollowUp = (status: AttendanceStatus): boolean => (ABSENCE_STATUSES as readonly AttendanceStatus[]).includes(status);

/** RF-29: una causa médica o un accidente exige alta antes de volver a ingresar. */
export const requiresMedicalRelease = (cause: FollowUpCause): boolean => cause === 'ENF_CASA' || cause === 'ACC_EXT';

export const SECOND_ATTEMPT_DELAY_HOURS = 4;
const MS_PER_HOUR = 3_600_000;

/** RF-27: cuándo toca el segundo intento tras no localizar al tutor. */
export const secondAttemptDueAt = (firstAttemptAt: Date): Date => new Date(firstAttemptAt.getTime() + SECOND_ATTEMPT_DELAY_HOURS * MS_PER_HOUR);

export const ABSENCE_CUTOFF_HOUR = 9;

const localParts = (instant: Date, timeZone: string): { date: string; hour: number } => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
};

/**
 * ¿Ya pasaron las 09:00 de la fecha de la jornada en la zona horaria de la
 * estancia? (RF-24, S-07). Una fecha anterior ya cerró; una futura, no.
 */
export function cutoffReached(now: Date, timeZone: string, journeyDate: string): boolean {
  const local = localParts(now, timeZone);
  if (local.date !== journeyDate) return local.date > journeyDate;
  return local.hour >= ABSENCE_CUTOFF_HOUR;
}

export const CONTACT_RESULTS = ['CONTACTADO', 'SIN_RESPUESTA'] as const;
export type ContactResult = (typeof CONTACT_RESULTS)[number];

/** Causas que el personal puede asignar al hablar con el tutor; NO_LOC solo la fija el sistema. */
export const CONTACT_CAUSES = ['ENF_CASA', 'ACC_EXT', 'PER_TUT'] as const satisfies readonly FollowUpCause[];

/** RF-27: tras dos intentos fallidos con causa NO_LOC se alerta a los contactos de emergencia. */
export const EMERGENCY_ALERT_AFTER_ATTEMPTS = 2;

export const isEmergencyAlert = (cause: FollowUpCause | null, failedAttempts: number): boolean =>
  cause === 'NO_LOC' && failedAttempts >= EMERGENCY_ALERT_AFTER_ATTEMPTS;

export interface FollowUpState {
  readonly cause: FollowUpCause | null;
  readonly requiresMedicalRelease: boolean;
  readonly expectedReturnDate: string | null;
  readonly failedAttempts: number;
}

export interface ContactInput {
  readonly result: ContactResult;
  readonly cause?: FollowUpCause | undefined;
  readonly expectedReturnDate?: string | undefined;
  readonly at: Date;
}

export interface FollowUpAfterContact extends FollowUpState {
  readonly status: 'CLASIFICADO';
  /** Cuándo toca el segundo intento; nulo si ya no hay uno pendiente. */
  readonly nextAttemptAt: Date | null;
  readonly emergencyAlert: boolean;
}

export type ContactOutcome =
  | { readonly ok: true; readonly state: FollowUpAfterContact }
  | { readonly ok: false; readonly reason: 'CAUSA_REQUERIDA' | 'CAUSA_NO_VALIDA' | 'RETORNO_REQUERIDO' };

const reached = (state: FollowUpState, input: ContactInput): ContactOutcome => {
  if (input.cause === undefined) return { ok: false, reason: 'CAUSA_REQUERIDA' };
  if (input.cause === 'NO_LOC') return { ok: false, reason: 'CAUSA_NO_VALIDA' };
  if (input.expectedReturnDate === undefined) return { ok: false, reason: 'RETORNO_REQUERIDO' };
  return {
    ok: true,
    state: {
      status: 'CLASIFICADO',
      cause: input.cause,
      requiresMedicalRelease: requiresMedicalRelease(input.cause),
      expectedReturnDate: input.expectedReturnDate,
      failedAttempts: state.failedAttempts,
      nextAttemptAt: null,
      emergencyAlert: false,
    },
  };
};

const notReached = (state: FollowUpState, input: ContactInput): ContactOutcome => {
  const failedAttempts = state.failedAttempts + 1;
  // Una llamada perdida no reclasifica un caso que ya tiene causa distinta de NO_LOC.
  const cause = state.cause === null || state.cause === 'NO_LOC' ? 'NO_LOC' : state.cause;
  const alert = isEmergencyAlert(cause, failedAttempts);
  return {
    ok: true,
    state: {
      status: 'CLASIFICADO',
      cause,
      requiresMedicalRelease: state.requiresMedicalRelease,
      expectedReturnDate: state.expectedReturnDate,
      failedAttempts,
      nextAttemptAt: cause === 'NO_LOC' && !alert ? secondAttemptDueAt(input.at) : null,
      emergencyAlert: alert,
    },
  };
};

/**
 * Efecto de un intento de contacto con el tutor sobre el ticket (RF-25 a
 * RF-29). Hablar con el tutor exige causa y fecha de retorno; no localizarlo
 * clasifica NO_LOC, programa el segundo intento a las 4 horas y, si vuelve a
 * fallar, activa la alerta a los contactos de emergencia.
 */
export const applyContact = (state: FollowUpState, input: ContactInput): ContactOutcome =>
  input.result === 'CONTACTADO' ? reached(state, input) : notReached(state, input);

export interface TicketLockState {
  readonly status: FollowUpStatus;
  readonly requiresMedicalRelease: boolean;
  /** Ya existe el alta médica del caso. */
  readonly released: boolean;
}

/** RF-29: el infante no puede marcarse Presente mientras su caso requiera alta y no la tenga. */
export const isMedicalLockActive = (state: TicketLockState): boolean =>
  state.requiresMedicalRelease && !state.released && state.status !== 'CERRADO';

export type ReleaseCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'YA_CERRADO' | 'NO_REQUIERE_ALTA' | 'YA_LIBERADO' };

/** RF-30: el alta solo tiene sentido en un caso abierto con candado activo. */
export function canRegisterRelease(state: TicketLockState): ReleaseCheck {
  if (state.status === 'CERRADO') return { ok: false, reason: 'YA_CERRADO' };
  if (!state.requiresMedicalRelease) return { ok: false, reason: 'NO_REQUIERE_ALTA' };
  if (state.released) return { ok: false, reason: 'YA_LIBERADO' };
  return { ok: true };
}

export interface CloseState extends TicketLockState {
  readonly cause: FollowUpCause | null;
  readonly attemptCount: number;
}

export type CloseCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'YA_CERRADO' | 'SIN_CONTACTO' | 'SIN_CLASIFICAR' | 'FALTA_ALTA_MEDICA' };

/**
 * Cuándo se puede cerrar un caso: ya se llamó al tutor (RF-25), se clasificó
 * la causa (RF-26) y, si hay candado médico, el médico dio el alta (RF-30).
 */
export function canClose(state: CloseState): CloseCheck {
  if (state.status === 'CERRADO') return { ok: false, reason: 'YA_CERRADO' };
  if (state.attemptCount === 0) return { ok: false, reason: 'SIN_CONTACTO' };
  if (state.cause === null) return { ok: false, reason: 'SIN_CLASIFICAR' };
  if (isMedicalLockActive(state)) return { ok: false, reason: 'FALTA_ALTA_MEDICA' };
  return { ok: true };
}
