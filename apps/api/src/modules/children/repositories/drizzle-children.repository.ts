import { Inject, Injectable } from '@nestjs/common';
import { CHILD_STATUSES, ROOM_STATUSES, SHIFTS, type ChildStatus, type RoomStatus, type Shift } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { ApiError } from '../../../common/errors/api-error';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { ChildChanges, ChildRecord, NewChild, NewEnrollment, RoomRecord } from '../children.types';
import type { ChildrenRepository } from './children.repository';

const { rooms, children, enrollments, enrollmentMovements, ciclosEscolares, attendanceRecords } = schema;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

type RoomRow = typeof rooms.$inferSelect;

const pick = <T extends string>(allowed: readonly T[], value: string, fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const toRoom = (row: RoomRow): RoomRecord => ({
  id: row.id,
  estanciaId: row.estanciaId,
  name: row.name,
  shift: pick<Shift>(SHIFTS, row.shift, 'MATUTINO'),
  minAgeMonths: row.minAgeMonths,
  maxAgeMonths: row.maxAgeMonths,
  capacity: row.capacity,
  status: pick<RoomStatus>(ROOM_STATUSES, row.status, 'INACTIVO'),
});

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

const childColumns = {
  id: children.id,
  enrollmentNumber: children.enrollmentNumber,
  name: children.name,
  paternalSurname: children.paternalSurname,
  maternalSurname: children.maternalSurname,
  birthDate: children.birthDate,
  hasDisability: children.hasDisability,
  status: children.status,
  roomId: rooms.id,
  roomName: rooms.name,
};

const toChild = (row: { status: string } & Omit<ChildRecord, 'status'>): ChildRecord => ({
  ...row,
  status: pick<ChildStatus>(CHILD_STATUSES, row.status, 'BAJA'),
});

@Injectable()
export class DrizzleChildrenRepository implements ChildrenRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listActiveRooms(estanciaId: number): Promise<RoomRecord[]> {
    const rows = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.estanciaId, estanciaId), eq(rooms.status, 'ACTIVO'), isNull(rooms.deletedAt)))
      .orderBy(asc(rooms.name));
    return rows.map(toRoom);
  }

  async findRoom(id: number): Promise<RoomRecord | null> {
    const [row] = await this.db.select().from(rooms).where(and(eq(rooms.id, id), isNull(rooms.deletedAt)));
    return row ? toRoom(row) : null;
  }

  async countActiveInRoom(roomId: number): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(enrollments)
      .where(and(eq(enrollments.roomId, roomId), eq(enrollments.status, 'ACTIVA'), isNull(enrollments.deletedAt)));
    return Number(row?.total ?? 0);
  }

  async findActiveSchoolYearId(): Promise<number | null> {
    const [row] = await this.db
      .select({ id: ciclosEscolares.id })
      .from(ciclosEscolares)
      .where(eq(ciclosEscolares.status, 'ACTIVO'))
      .orderBy(asc(ciclosEscolares.id))
      .limit(1);
    return row?.id ?? null;
  }

  /** Infantes con inscripción activa en la estancia, sin borrados lógicos. */
  private activeChildrenQuery(estanciaId: number, childId?: number) {
    return this.db
      .select(childColumns)
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .where(
        and(
          eq(enrollments.estanciaId, estanciaId),
          eq(enrollments.status, 'ACTIVA'),
          isNull(enrollments.deletedAt),
          isNull(children.deletedAt),
          childId === undefined ? undefined : eq(children.id, childId),
        ),
      );
  }

  async listChildren(estanciaId: number): Promise<ChildRecord[]> {
    const rows = await this.activeChildrenQuery(estanciaId).orderBy(
      asc(children.paternalSurname),
      asc(children.maternalSurname),
      asc(children.name),
    );
    return rows.map(toChild);
  }

  async findChild(id: number, estanciaId: number): Promise<ChildRecord | null> {
    const [row] = await this.activeChildrenQuery(estanciaId, id).limit(1);
    return row ? toChild(row) : null;
  }

  async updateChild(id: number, changes: ChildChanges, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.update(children).set({ ...changes, updatedAt: now }).where(and(eq(children.id, id), isNull(children.deletedAt)));
        await inSameTransaction?.(tx, undefined);
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Ya existe un infante con esa matrícula o CURP.');
      throw error;
    }
  }

  async hasAttendance(childId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .innerJoin(enrollments, eq(enrollments.id, attendanceRecords.enrollmentId))
      .where(eq(enrollments.childId, childId))
      .limit(1);
    return row !== undefined;
  }

  async softDeleteChild(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const mark = { deletedAt: now, deletedBy: userId, updatedAt: now };
      await tx.update(enrollments).set(mark).where(and(eq(enrollments.childId, id), isNull(enrollments.deletedAt)));
      await tx.update(children).set(mark).where(and(eq(children.id, id), isNull(children.deletedAt)));
      await inSameTransaction?.(tx, undefined);
    });
  }

  async registerChild(
    child: NewChild,
    enrollment: NewEnrollment,
    userId: number,
    now: Date,
    inSameTransaction?: TransactionHook<number>,
  ): Promise<number> {
    try {
      return await this.db.transaction(async (tx) => {
        const [created] = await tx.insert(children).values({ ...child, createdAt: now, updatedAt: now });
        const [inscription] = await tx.insert(enrollments).values({
          childId: created.insertId,
          estanciaId: enrollment.estanciaId,
          roomId: enrollment.roomId,
          schoolYearId: enrollment.schoolYearId,
          startDate: enrollment.startDate,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(enrollmentMovements).values({
          enrollmentId: inscription.insertId,
          type: 'ALTA',
          occurredAt: now,
          newEstanciaId: enrollment.estanciaId,
          newRoomId: enrollment.roomId,
          userId,
          createdAt: now,
        });
        await inSameTransaction?.(tx, created.insertId);
        return created.insertId;
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Ya existe un infante con esa matrícula o CURP.');
      throw error;
    }
  }
}
