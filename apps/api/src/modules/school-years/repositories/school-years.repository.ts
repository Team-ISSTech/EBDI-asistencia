import type { SchoolYearUsage } from '@sirai/domain';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { NewSchoolYear, PurgeCounts, SchoolYearRecord } from '../school-years.types';

export interface SchoolYearsRepository {
  /** Del más reciente al más antiguo. */
  list(): Promise<SchoolYearRecord[]>;
  findById(id: number): Promise<SchoolYearRecord | null>;
  findActive(): Promise<SchoolYearRecord | null>;
  /** Jornadas abiertas y seguimientos sin cerrar del ciclo: lo que impide archivarlo. */
  usage(id: number): Promise<SchoolYearUsage>;
  /**
   * Archiva el ciclo activo (si se indica) y abre el nuevo, en una transacción
   * con lo que haga `inSameTransaction` (la auditoría). Lanza CONFLICTO si la clave ya existe
   * o si otro administrador cambió el ciclo activo al mismo tiempo.
   */
  openNew(
    archive: { id: number; userId: number } | null,
    next: NewSchoolYear,
    now: Date,
    inSameTransaction?: TransactionHook<number>,
  ): Promise<number>;
  /**
   * Vacía los datos sensibles cifrados de los seguimientos del ciclo (teléfono y notas de
   * los contactos, observaciones de las altas médicas) sin borrar ninguna fila, y marca el
   * ciclo como depurado. Todo en una transacción.
   */
  purge(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<PurgeCounts>): Promise<PurgeCounts>;
}

export const SCHOOL_YEARS_REPOSITORY = Symbol('SCHOOL_YEARS_REPOSITORY');
