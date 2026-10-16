import { TRAFFIC_LIGHTS } from '@sirai/domain';
import { z } from 'zod';

const countSchema = z.number().int().nonnegative();
const rateSchema = z.number().min(0).max(1).nullable();
const lightSchema = z.enum(TRAFFIC_LIGHTS);

export const dashboardQuerySchema = z.object({ date: z.iso.date() });

/**
 * Una estancia en el tablero (RF-16). Solo conteos y porcentajes: ningún dato
 * identificable de infantes ni tutores (RF-18, S-10).
 */
export const dashboardRowSchema = z.object({
  estanciaId: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  region: z.string().nullable(),
  /** Inscritos activos en salas de los turnos que abrieron jornada ese día. */
  enrolled: countSchema,
  present: countSchema,
  absent: countSchema,
  /** Comisión médica y filtro sanitario. */
  other: countSchema,
  /** Inscritos sin marca todavía. */
  pending: countSchema,
  rate: rateSchema,
  light: lightSchema,
});

export const dashboardTotalsSchema = z.object({
  estancias: countSchema,
  enrolled: countSchema,
  present: countSchema,
  absent: countSchema,
  other: countSchema,
  pending: countSchema,
  rate: rateSchema,
  lights: z.object({ VERDE: countSchema, AMARILLO: countSchema, ROJO: countSchema, SIN_CAPTURA: countSchema }),
});

export const dashboardResponseSchema = z.object({
  date: z.iso.date(),
  totals: dashboardTotalsSchema,
  estancias: z.array(dashboardRowSchema),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardRow = z.infer<typeof dashboardRowSchema>;
export type DashboardTotals = z.infer<typeof dashboardTotalsSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
