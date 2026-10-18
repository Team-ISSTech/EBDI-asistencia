import type { AuditFacets, AuditFilters, AuditRow } from '../audit-query.types';

/** Solo lectura: la bitácora es inmutable y aquí nunca se escribe. */
export interface AuditQueryRepository {
  /** Más recientes primero; `limit` renglones como máximo. */
  list(filters: AuditFilters, limit: number): Promise<AuditRow[]>;
  /** Acciones y tablas que existen en la bitácora, para los filtros. */
  facets(): Promise<AuditFacets>;
}

export const AUDIT_QUERY_REPOSITORY = Symbol('AUDIT_QUERY_REPOSITORY');
