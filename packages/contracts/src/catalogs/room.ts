import { ROOM_STATUSES, SHIFTS } from '@sirai/domain';
import { z } from 'zod';
import { positiveIdSchema } from './common.js';

const MAX_AGE_MONTHS = 72;
const MAX_CAPACITY = 200;
const monthsSchema = z.number().int().min(0).max(MAX_AGE_MONTHS);

export const shiftSchema = z.enum(SHIFTS);

export const roomSchema = z.object({
  id: positiveIdSchema,
  estanciaId: positiveIdSchema,
  name: z.string(),
  shift: shiftSchema,
  minAgeMonths: monthsSchema.nullable(),
  maxAgeMonths: monthsSchema.nullable(),
  capacity: z.number().int().positive().nullable(),
  status: z.enum(ROOM_STATUSES),
});

export const roomListResponseSchema = z.object({ rooms: z.array(roomSchema) });

export const createRoomRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    shift: shiftSchema,
    minAgeMonths: monthsSchema.nullable().default(null),
    maxAgeMonths: monthsSchema.nullable().default(null),
    capacity: z.number().int().positive().max(MAX_CAPACITY).nullable().default(null),
  })
  .refine(({ minAgeMonths, maxAgeMonths }) => minAgeMonths === null || maxAgeMonths === null || minAgeMonths <= maxAgeMonths, {
    message: 'La edad mínima no puede ser mayor que la máxima.',
    path: ['maxAgeMonths'],
  });

export type Room = z.infer<typeof roomSchema>;
export type RoomListResponse = z.infer<typeof roomListResponseSchema>;
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
