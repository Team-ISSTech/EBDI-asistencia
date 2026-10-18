import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { EnrollmentRecord, MovementRecord, PendingTransferRecord, TransferDestinationRecord } from '../children.types';
import type { EnrollmentsRepository } from './enrollments.repository';

const { enrollments, enrollmentMovements, children, estancias } = schema;
const DATE_LENGTH = 10;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const isoDate = (date: Date): string => date.toISOString().slice(0, DATE_LENGTH);

/** Traslados cuyo destino es la estancia y que nadie ha recibido: no hay inscripción posterior del infante. */
const pendingColumns = {
  enrollmentId: enrollments.id,
  childId: children.id,
  name: children.name,
  paternalSurname: children.paternalSurname,
  maternalSurname: children.maternalSurname,
  enrollmentNumber: children.enrollmentNumber,
  birthDate: children.birthDate,
  fromEstanciaId: enrollments.estanciaId,
  fromEstanciaName: estancias.name,
  movedAt: enrollmentMovements.occurredAt,
  reason: enrollmentMovements.reason,
};

type PendingRow = {
  enrollmentId: number;
  childId: number;
  name: string;
  paternalSurname: string;
  maternalSurname: string | null;
  enrollmentNumber: string;
  birthDate: string;
  fromEstanciaId: number;
  fromEstanciaName: string;
  movedAt: Date;
  reason: string | null;
};

const toPending = (row: PendingRow): PendingTransferRecord => ({
  enrollmentId: row.enrollmentId,
  childId: row.childId,
  childName: [row.name, row.paternalSurname, row.maternalSurname].filter((part): part is string => Boolean(part)).join(' '),
  enrollmentNumber: row.enrollmentNumber,
  birthDate: row.birthDate,
  fromEstanciaId: row.fromEstanciaId,
  fromEstanciaName: row.fromEstanciaName,
  movedAt: row.movedAt,
  reason: row.reason,
});

@Injectable()
export class DrizzleEnrollmentsRepository implements EnrollmentsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findActive(childId: number, estanciaId: number): Promise<EnrollmentRecord | null> {
    const [row] = await this.db
      .select({
        id: enrollments.id,
        childId: enrollments.childId,
        estanciaId: enrollments.estanciaId,
        roomId: enrollments.roomId,
        schoolYearId: enrollments.schoolYearId,
      })
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .where(
        and(
          eq(enrollments.childId, childId),
          eq(enrollments.estanciaId, estanciaId),
          eq(enrollments.status, 'ACTIVA'),
          isNull(enrollments.deletedAt),
          isNull(children.deletedAt),
        ),
      )
      .limit(1);
    return row ? { ...row, status: 'ACTIVA' } : null;
  }

  async listTransferDestinations(exceptEstanciaId: number): Promise<TransferDestinationRecord[]> {
    return this.db
      .select({ id: estancias.id, code: estancias.ebdiCode, name: estancias.name })
      .from(estancias)
      .where(and(eq(estancias.status, 'ACTIVA'), isNull(estancias.deletedAt), ne(estancias.id, exceptEstanciaId)))
      .orderBy(asc(estancias.name));
  }

  async isEstanciaActive(id: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: estancias.id })
      .from(estancias)
      .where(and(eq(estancias.id, id), eq(estancias.status, 'ACTIVA'), isNull(estancias.deletedAt)));
    return row !== undefined;
  }

  private async insertMovement(tx: Tx, enrollmentId: number, movement: MovementRecord, userId: number, now: Date): Promise<void> {
    await tx.insert(enrollmentMovements).values({
      enrollmentId,
      type: movement.type,
      occurredAt: now,
      previousEstanciaId: movement.previousEstanciaId,
      newEstanciaId: movement.newEstanciaId,
      previousRoomId: movement.previousRoomId,
      newRoomId: movement.newRoomId,
      reason: movement.reason,
      userId,
      createdAt: now,
    });
  }

  async changeRoom(enrollment: EnrollmentRecord, movement: MovementRecord, userId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(enrollments).set({ roomId: movement.newRoomId as number, updatedAt: now }).where(eq(enrollments.id, enrollment.id));
      await this.insertMovement(tx, enrollment.id, movement, userId, now);
      await inSameTransaction?.(tx, undefined);
    });
  }

  async finish(
    enrollment: EnrollmentRecord,
    status: 'BAJA' | 'TRASLADADA',
    movement: MovementRecord,
    userId: number,
    now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(enrollments).set({ status, endDate: isoDate(now), updatedAt: now }).where(eq(enrollments.id, enrollment.id));
      if (status === 'BAJA') await tx.update(children).set({ status: 'BAJA', updatedAt: now }).where(eq(children.id, enrollment.childId));
      await this.insertMovement(tx, enrollment.id, movement, userId, now);
      await inSameTransaction?.(tx, undefined);
    });
  }

  private pendingQuery(toEstanciaId: number, enrollmentId?: number) {
    return this.db
      .select(pendingColumns)
      .from(enrollments)
      .innerJoin(enrollmentMovements, and(eq(enrollmentMovements.enrollmentId, enrollments.id), eq(enrollmentMovements.type, 'TRASLADO')))
      .innerJoin(children, eq(children.id, enrollments.childId))
      .innerJoin(estancias, eq(estancias.id, enrollments.estanciaId))
      .where(
        and(
          eq(enrollmentMovements.newEstanciaId, toEstanciaId),
          enrollmentId === undefined ? undefined : eq(enrollments.id, enrollmentId),
          eq(enrollments.status, 'TRASLADADA'),
          isNull(enrollments.deletedAt),
          isNull(children.deletedAt),
          sql`NOT EXISTS (SELECT 1 FROM inscripciones later WHERE later.infante_id = inscripciones.infante_id AND later.id > inscripciones.id AND later.deleted_at IS NULL)`,
        ),
      );
  }

  async listPendingTransfers(toEstanciaId: number): Promise<PendingTransferRecord[]> {
    const rows = await this.pendingQuery(toEstanciaId).orderBy(asc(enrollmentMovements.occurredAt));
    return rows.map(toPending);
  }

  async findPendingTransfer(enrollmentId: number, toEstanciaId: number): Promise<PendingTransferRecord | null> {
    const [row] = await this.pendingQuery(toEstanciaId, enrollmentId).limit(1);
    return row ? toPending(row) : null;
  }

  async receiveTransfer(
    transfer: PendingTransferRecord,
    destination: { estanciaId: number; roomId: number; schoolYearId: number },
    userId: number,
    now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(enrollments).values({
        childId: transfer.childId,
        estanciaId: destination.estanciaId,
        roomId: destination.roomId,
        schoolYearId: destination.schoolYearId,
        startDate: isoDate(now),
        createdAt: now,
        updatedAt: now,
      });
      const movement: MovementRecord = {
        type: 'ALTA',
        previousEstanciaId: transfer.fromEstanciaId,
        newEstanciaId: destination.estanciaId,
        previousRoomId: null,
        newRoomId: destination.roomId,
        reason: transfer.reason,
      };
      await this.insertMovement(tx, created.insertId, movement, userId, now);
      await inSameTransaction?.(tx, undefined);
    });
  }
}
