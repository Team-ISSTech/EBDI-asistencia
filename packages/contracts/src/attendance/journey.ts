import { JOURNEY_STATUSES, SHIFTS } from '@sirai/domain';
import { z } from 'zod';

const positiveIdSchema = z.number().int().positive();
const shiftSchema = z.enum(SHIFTS);
const journeyBaseSchema = z.object({
  id: positiveIdSchema,
  estanciaId: positiveIdSchema,
  date: z.iso.date(),
  shift: shiftSchema,
  openedAt: z.iso.datetime(),
});

export const openAttendanceJourneyRequestSchema = z.object({ date: z.iso.date(), shift: shiftSchema });

export const attendanceJourneySchema = z.discriminatedUnion('status', [
  journeyBaseSchema.extend({ status: z.literal(JOURNEY_STATUSES[0]), closedAt: z.null() }),
  journeyBaseSchema.extend({ status: z.literal(JOURNEY_STATUSES[1]), closedAt: z.iso.datetime() }),
]);

export type OpenAttendanceJourneyRequest = z.infer<typeof openAttendanceJourneyRequestSchema>;
export type AttendanceJourney = z.infer<typeof attendanceJourneySchema>;
