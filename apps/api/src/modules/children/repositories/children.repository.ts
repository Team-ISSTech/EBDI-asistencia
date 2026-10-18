import type { TransactionHook } from '../../identity/repositories/repositories';
import type { ChildChanges, ChildRecord, NewChild, NewEnrollment, RoomRecord } from '../children.types';

export interface ChildrenRepository {
  listActiveRooms(estanciaId: number): Promise<RoomRecord[]>;
  findRoom(id: number): Promise<RoomRecord | null>;
  /** Infantes con inscripción activa en la sala; sirve para respetar su capacidad. */
  countActiveInRoom(roomId: number): Promise<number>;
  /** Id del ciclo escolar con estado ACTIVO, o null si no hay. */
  findActiveSchoolYearId(): Promise<number | null>;
  /** Infantes con inscripción activa en la estancia. */
  listChildren(estanciaId: number): Promise<ChildRecord[]>;
  findChild(id: number, estanciaId: number): Promise<ChildRecord | null>;
  /** Lanza CONFLICTO si la CURP nueva ya pertenece a otro infante. */
  updateChild(id: number, changes: ChildChanges, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  /** ¿Alguna de sus inscripciones tiene asistencia registrada? */
  hasAttendance(childId: number): Promise<boolean>;
  /** Borrado lógico del infante y de sus inscripciones, con quién y cuándo. */
  softDeleteChild(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  /**
   * Alta atómica: infante + inscripción + movimiento ALTA + lo que haga
   * `inSameTransaction` (la auditoría). Lanza CONFLICTO si la matrícula o
   * la CURP ya existen.
   */
  registerChild(
    child: NewChild,
    enrollment: NewEnrollment,
    userId: number,
    now: Date,
    inSameTransaction?: TransactionHook<number>,
  ): Promise<number>;
}

export const CHILDREN_REPOSITORY = Symbol('CHILDREN_REPOSITORY');
