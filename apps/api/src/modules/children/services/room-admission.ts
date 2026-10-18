import { ageInMonths, fitsRoomAge, roomHasSpace } from '@sirai/domain';
import { ApiError } from '../../../common/errors/api-error';
import type { RoomRecord } from '../children.types';
import type { ChildrenRepository } from '../repositories/children.repository';

export interface RoomAdmission {
  readonly estanciaId: number;
  readonly roomId: number;
  readonly birthDate: string;
  readonly on: Date;
}

/**
 * Reglas para que una sala reciba a un infante (alta, cambio de sala, recepción
 * de un traslado): es de la estancia, está activa, tiene lugar y la edad cabe.
 * Una sala de otra estancia se trata como inexistente.
 */
export async function requireRoomThatAccepts(children: ChildrenRepository, admission: RoomAdmission): Promise<RoomRecord> {
  const room = await children.findRoom(admission.roomId);
  if (room?.estanciaId !== admission.estanciaId) throw new ApiError('NO_ENCONTRADO', 'Sala no encontrada.');
  if (room.status !== 'ACTIVO') throw new ApiError('CONFLICTO', 'La sala no está activa.');
  if (!roomHasSpace(room.capacity, await children.countActiveInRoom(room.id))) throw new ApiError('CONFLICTO', 'La sala está llena.');
  const months = ageInMonths(admission.birthDate, admission.on.toISOString());
  if (!fitsRoomAge(months, { minMonths: room.minAgeMonths, maxMonths: room.maxAgeMonths })) {
    throw new ApiError('DATOS_INVALIDOS', 'La edad del infante está fuera del rango de la sala.');
  }
  return room;
}
