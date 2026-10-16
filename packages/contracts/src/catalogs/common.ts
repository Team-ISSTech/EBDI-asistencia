import { z } from 'zod';

export const positiveIdSchema = z.number().int().positive();

/** Fecha de calendario `YYYY-MM-DD` válida. */
export const isoDateSchema = z.iso.date();
