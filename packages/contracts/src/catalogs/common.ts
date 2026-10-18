import { z } from 'zod';

export const positiveIdSchema = z.number().int().positive();

/** Fecha de calendario `YYYY-MM-DD` válida. */
export const isoDateSchema = z.iso.date();

/** Una edición parcial debe traer al menos un campo. */
export const hasChange = (value: object): boolean => Object.keys(value).length > 0;
export const NO_CHANGE = { message: 'Indica al menos un cambio.' };
