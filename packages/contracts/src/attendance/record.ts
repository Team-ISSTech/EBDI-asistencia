import { ATTENDANCE_METHODS, ATTENDANCE_STATUSES } from '@sirai/domain';
import { z } from 'zod';

const positiveIdSchema = z.number().int().positive();
const MAX_MARKS_PER_REQUEST = 500;

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

/** Un infante de la lista de la jornada, con su estado si ya se marcó. Sin datos de salud ni contacto. */
export const rosterEntrySchema = z.object({
  enrollmentId: positiveIdSchema,
  childId: positiveIdSchema,
  childName: z.string(),
  enrollmentNumber: z.string(),
  roomId: positiveIdSchema,
  roomName: z.string(),
  status: attendanceStatusSchema.nullable(),
  /** RF-29: el infante requiere alta médica y no puede marcarse Presente. Solo el indicador, nunca el motivo. */
  medicalLock: z.boolean(),
});

export const rosterResponseSchema = z.object({ entries: z.array(rosterEntrySchema) });

/**
 * `clientId` lo genera el cliente: si la petición se repite (red inestable,
 * modo sin conexión), el servidor reconoce la operación y no la duplica.
 */
export const attendanceMarkSchema = z.object({
  enrollmentId: positiveIdSchema,
  status: attendanceStatusSchema,
  clientId: z.uuid(),
  method: z.enum(ATTENDANCE_METHODS).default('MANUAL'),
});

const hasUnique = (values: readonly unknown[]): boolean => new Set(values).size === values.length;

export const markAttendanceRequestSchema = z
  .object({ marks: z.array(attendanceMarkSchema).min(1).max(MAX_MARKS_PER_REQUEST) })
  .refine(({ marks }) => hasUnique(marks.map((mark) => mark.enrollmentId)), { message: 'Un infante aparece más de una vez en el lote.' })
  .refine(({ marks }) => hasUnique(marks.map((mark) => mark.clientId)), { message: 'Un identificador de operación se repite en el lote.' });

export const markAttendanceResponseSchema = z.object({
  /** Marcas nuevas o cambiadas; las repetidas no cuentan. */
  saved: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
});

export type RosterEntry = z.infer<typeof rosterEntrySchema>;
export type RosterResponse = z.infer<typeof rosterResponseSchema>;
export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;
export type MarkAttendanceRequest = z.infer<typeof markAttendanceRequestSchema>;
export type MarkAttendanceResponse = z.infer<typeof markAttendanceResponseSchema>;
