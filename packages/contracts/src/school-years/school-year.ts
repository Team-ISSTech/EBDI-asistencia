import { z } from 'zod';
import { isoDateSchema } from '../catalogs/common.js';

const MAX_CODE = 20;

export const SCHOOL_YEAR_STATUSES = ['ACTIVO', 'ARCHIVADO'] as const;

/** Abrir un ciclo nuevo archiva el actual (si lo hay): el ciclo anterior queda de solo lectura. */
export const openSchoolYearRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(MAX_CODE).regex(/^[A-Za-z0-9-]+$/, { message: 'Usa solo letras, números y guiones.' }),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .refine(({ startDate, endDate }) => endDate >= startDate, { message: 'El fin del ciclo no puede ser anterior a su inicio.', path: ['endDate'] });

/** Depurar vacía datos sensibles y no se deshace: se confirma escribiendo la clave del ciclo. */
export const purgeSchoolYearRequestSchema = z.object({ confirmCode: z.string().trim().min(1).max(MAX_CODE) });

const countSchema = z.number().int().nonnegative();

export const purgeSchoolYearResponseSchema = z.object({
  /** Intentos de contacto cuyo teléfono y notas se vaciaron. */
  contacts: countSchema,
  /** Altas médicas cuyas observaciones se vaciaron. */
  releases: countSchema,
});

export const schoolYearSchema = z.object({
  id: z.number().int().positive(),
  code: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: z.enum(SCHOOL_YEAR_STATUSES),
  archivedAt: z.iso.datetime().nullable(),
  /** Desde cuándo se puede depurar (5 años después de archivado); nulo si no está archivado. */
  purgeEligibleOn: z.iso.datetime().nullable(),
  purgedAt: z.iso.datetime().nullable(),
  /** El servidor ya comprobó las reglas: archivado, con 5 años cumplidos y sin depurar. */
  canPurge: z.boolean(),
  /** Lo que impide cerrar el ciclo activo; nulo en los archivados. */
  usage: z.object({ openJourneys: countSchema, openFollowUps: countSchema }).nullable(),
});

export const schoolYearListResponseSchema = z.object({ schoolYears: z.array(schoolYearSchema) });

export type OpenSchoolYearRequest = z.infer<typeof openSchoolYearRequestSchema>;
export type PurgeSchoolYearRequest = z.infer<typeof purgeSchoolYearRequestSchema>;
export type PurgeSchoolYearResponse = z.infer<typeof purgeSchoolYearResponseSchema>;
export type SchoolYearView = z.infer<typeof schoolYearSchema>;
export type SchoolYearListResponse = z.infer<typeof schoolYearListResponseSchema>;
