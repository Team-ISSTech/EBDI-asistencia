import type { AdminRoomRecord, NewRoom, RoomChanges } from '../administration.types';
import type { AdminHook } from './estancias-admin.repository';

export interface RoomsAdminRepository {
  /** Salas de la estancia que no están dadas de baja, con su número de inscritos activos. */
  list(estanciaId: number): Promise<AdminRoomRecord[]>;
  findById(id: number): Promise<AdminRoomRecord | null>;
  /** Lanza CONFLICTO si ya hay una sala con ese nombre y turno en la estancia. */
  create(input: NewRoom, now: Date, hook: AdminHook<number>): Promise<number>;
  update(id: number, changes: RoomChanges, now: Date, hook: AdminHook<void>): Promise<void>;
  /** Borrado lógico: marca `deleted_at` y `deleted_by`; nunca DELETE. */
  retire(id: number, userId: number, now: Date, hook: AdminHook<void>): Promise<void>;
}

export const ROOMS_ADMIN_REPOSITORY = Symbol('ROOMS_ADMIN_REPOSITORY');
