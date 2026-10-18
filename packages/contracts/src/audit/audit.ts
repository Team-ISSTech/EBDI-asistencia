import { z } from 'zod';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_ACTION = 30;
const MAX_TABLE = 80;
const MAX_RECORD = 100;

/**
 * Filtros de `GET /auditoria`. La paginación es por cursor (`beforeId`): la
 * bitácora solo crece, así que "los anteriores a este id" no se mueve mientras se pagina.
 * Las fechas llegan como instante: la pantalla convierte el día local al instante.
 */
export const auditQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    userId: z.coerce.number().int().positive().optional(),
    action: z.string().trim().min(1).max(MAX_ACTION).optional(),
    table: z.string().trim().min(1).max(MAX_TABLE).optional(),
    recordId: z.string().trim().min(1).max(MAX_RECORD).optional(),
    beforeId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  })
  .refine(({ from, to }) => from === undefined || to === undefined || from <= to, { message: 'El rango de fechas está invertido.', path: ['to'] });

/**
 * Un renglón de la bitácora. Del cambio solo se muestran los nombres de los
 * campos: los valores (antes y después) pueden ser datos de menores y el rol
 * que consulta no accede a ellos.
 */
export const auditEntrySchema = z.object({
  id: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
  userId: z.number().int().positive().nullable(),
  userName: z.string().nullable(),
  roleCode: z.string().nullable(),
  action: z.string(),
  tableName: z.string(),
  recordId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  changedFields: z.array(z.string()),
});

export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
  /** Pasa como `beforeId` para pedir la página siguiente; nulo cuando ya no hay más. */
  nextBeforeId: z.number().int().positive().nullable(),
});

/** Valores que existen en la bitácora, para llenar los filtros. */
export const auditFiltersResponseSchema = z.object({ actions: z.array(z.string()), tables: z.array(z.string()) });

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditEntryView = z.infer<typeof auditEntrySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
export type AuditFiltersResponse = z.infer<typeof auditFiltersResponseSchema>;
