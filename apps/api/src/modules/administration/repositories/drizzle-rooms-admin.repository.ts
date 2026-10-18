import { Inject, Injectable } from '@nestjs/common';
import { isShift, ROOM_STATUSES, type RoomStatus, type Shift } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { ApiError } from '../../../common/errors/api-error';
import type { AdminRoomRecord, NewRoom, RoomChanges } from '../administration.types';
import type { AdminHook } from './estancias-admin.repository';
import type { RoomsAdminRepository } from './rooms-admin.repository';

const { rooms } = schema;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

const requireShift = (value: string): Shift => {
  if (!isShift(value)) throw new Error(`Turno no reconocido: ${value}`);
  return value;
};
const toStatus = (value: string): RoomStatus => ((ROOM_STATUSES as readonly string[]).includes(value) ? (value as RoomStatus) : 'INACTIVO');

/**
 * Inscritos activos de la sala, calculados en la misma consulta. La tabla se nombra
 * a mano: en una consulta de una sola tabla Drizzle escribe la columna sin
 * prefijo, y dentro de la subconsulta `id` sería el de `inscripciones`.
 */
const enrolledExpr = sql<number>`(SELECT COUNT(*) FROM inscripciones i WHERE i.sala_grupo_id = salas_grupos.id AND i.estatus = 'ACTIVA' AND i.deleted_at IS NULL)`;

const columns = {
  id: rooms.id,
  estanciaId: rooms.estanciaId,
  name: rooms.name,
  shift: rooms.shift,
  minAgeMonths: rooms.minAgeMonths,
  maxAgeMonths: rooms.maxAgeMonths,
  capacity: rooms.capacity,
  status: rooms.status,
  enrolled: enrolledExpr,
};

type Row = { id: number; estanciaId: number; name: string; shift: string; minAgeMonths: number | null; maxAgeMonths: number | null; capacity: number | null; status: string; enrolled: number };
const toRecord = (row: Row): AdminRoomRecord => ({ ...row, shift: requireShift(row.shift), status: toStatus(row.status), enrolled: Number(row.enrolled) });

@Injectable()
export class DrizzleRoomsAdminRepository implements RoomsAdminRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(estanciaId: number): Promise<AdminRoomRecord[]> {
    const result = await this.db
      .select(columns)
      .from(rooms)
      .where(and(eq(rooms.estanciaId, estanciaId), isNull(rooms.deletedAt)))
      .orderBy(asc(rooms.shift), asc(rooms.name));
    return result.map(toRecord);
  }

  async findById(id: number): Promise<AdminRoomRecord | null> {
    const [row] = await this.db.select(columns).from(rooms).where(and(eq(rooms.id, id), isNull(rooms.deletedAt)));
    return row ? toRecord(row) : null;
  }

  async create(input: NewRoom, now: Date, hook: AdminHook<number>): Promise<number> {
    try {
      return await this.db.transaction(async (tx) => {
        const [created] = await tx.insert(rooms).values({ ...input, createdAt: now, updatedAt: now });
        await hook(tx, created.insertId);
        return created.insertId;
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Ya existe una sala con ese nombre y turno en la estancia (puede estar dada de baja).');
      throw error;
    }
  }

  async update(id: number, changes: RoomChanges, now: Date, hook: AdminHook<void>): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.update(rooms).set({ ...changes, updatedAt: now }).where(eq(rooms.id, id));
        await hook(tx, undefined);
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Ya existe una sala con ese nombre y turno en la estancia.');
      throw error;
    }
  }

  async retire(id: number, userId: number, now: Date, hook: AdminHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(rooms).set({ status: 'INACTIVO', deletedAt: now, deletedBy: userId, updatedAt: now }).where(eq(rooms.id, id));
      await hook(tx, undefined);
    });
  }
}
