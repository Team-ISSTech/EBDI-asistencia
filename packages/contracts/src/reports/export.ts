import { REPORT_PERIODS } from '@sirai/domain';
import { z } from 'zod';

export const EXPORT_FORMATS = ['xlsx', 'pdf'] as const;

/**
 * Exportación del corte que contiene a `date`: diario, mensual o trimestral
 * (RF-17). El archivo solo trae conteos y porcentajes por estancia (RF-18).
 */
export const exportQuerySchema = z.object({
  period: z.enum(REPORT_PERIODS),
  date: z.iso.date(),
  format: z.enum(EXPORT_FORMATS),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
