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
