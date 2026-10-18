import type { EstanciaUsage } from '@sirai/domain';
import type { AuditExecutor } from '../../../common/audit/audit.service';
import type { EstanciaChanges, EstanciaRecord, NewEstancia } from '../administration.types';

export type AdminHook<T> = (executor: AuditExecutor, result: T) => Promise<void>;

export interface EstanciasAdminRepository {
  /** Todas las estancias que no están dadas de baja, activas o no. */
  list(): Promise<EstanciaRecord[]>;
  findById(id: number): Promise<EstanciaRecord | null>;
  /** Lanza CONFLICTO si la clave EBDI ya existe. */
  create(input: NewEstancia, now: Date, hook: AdminHook<number>): Promise<number>;
  update(id: number, changes: EstanciaChanges, now: Date, hook: AdminHook<void>): Promise<void>;
  /** Borrado lógico: marca `deleted_at` y `deleted_by`; nunca DELETE. */
  retire(id: number, userId: number, now: Date, hook: AdminHook<void>): Promise<void>;
  usage(id: number): Promise<EstanciaUsage>;
}

export const ESTANCIAS_ADMIN_REPOSITORY = Symbol('ESTANCIAS_ADMIN_REPOSITORY');
