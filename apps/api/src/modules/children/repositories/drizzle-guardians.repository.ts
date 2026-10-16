import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { ApiError } from '../../../common/errors/api-error';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { ChildGuardianRecord, GuardianRecord, NewChildGuardian, NewGuardian } from '../children.types';
import type { GuardiansRepository } from './guardians.repository';

const { guardians, childGuardians, enrollments } = schema;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';
const MISSING_REFERENCE = 'ER_NO_REFERENCED_ROW_2';

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

const guardianColumns = {
  id: guardians.id,
  name: guardians.name,
  paternalSurname: guardians.paternalSurname,
  maternalSurname: guardians.maternalSurname,
  hasPhone: sql<number>`${guardians.phoneEncrypted} IS NOT NULL`.mapWith(Boolean),
};

@Injectable()
export class DrizzleGuardiansRepository implements GuardiansRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  create(guardian: NewGuardian, now: Date, inSameTransaction?: TransactionHook<number>): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(guardians).values({ ...guardian, createdAt: now, updatedAt: now });
      await inSameTransaction?.(tx, created.insertId);
      return created.insertId;
    });
  }

  async findById(id: number): Promise<GuardianRecord | null> {
    const [row] = await this.db.select(guardianColumns).from(guardians).where(and(eq(guardians.id, id), isNull(guardians.deletedAt)));
    return row ?? null;
  }

  /** Vínculos cuya vigencia no ha terminado, ordenados con el principal primero. */
  async listForChild(childId: number): Promise<ChildGuardianRecord[]> {
    return this.db
      .select({
        ...guardianColumns,
        relationship: childGuardians.relationship,
        isPrimary: childGuardians.isPrimary,
        canPickUp: childGuardians.canPickUp,
        isEmergencyContact: childGuardians.isEmergencyContact,
        validFrom: childGuardians.validFrom,
        validUntil: childGuardians.validUntil,
      })
      .from(childGuardians)
      .innerJoin(guardians, eq(guardians.id, childGuardians.guardianId))
      .where(
        and(
          eq(childGuardians.childId, childId),
          isNull(guardians.deletedAt),
          or(isNull(childGuardians.validUntil), sql`${childGuardians.validUntil} >= CURRENT_DATE`),
        ),
      )
      .orderBy(sql`${childGuardians.isPrimary} DESC`, asc(guardians.paternalSurname), asc(guardians.name));
  }

  async link(childId: number, link: NewChildGuardian, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(childGuardians).values({ ...link, childId, createdAt: now, updatedAt: now });
        await inSameTransaction?.(tx, undefined);
      });
    } catch (error) {
      const code = driverCode(error);
      if (code === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'El tutor ya está vinculado a este infante.');
      if (code === MISSING_REFERENCE) throw new ApiError('NO_ENCONTRADO', 'Infante o tutor no encontrado.');
      throw error;
    }
  }

  async isLinkedInEstancia(guardianId: number, estanciaId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ childId: childGuardians.childId })
      .from(childGuardians)
      .innerJoin(enrollments, eq(enrollments.childId, childGuardians.childId))
      .where(
        and(
          eq(childGuardians.guardianId, guardianId),
          eq(enrollments.estanciaId, estanciaId),
          eq(enrollments.status, 'ACTIVA'),
          isNull(enrollments.deletedAt),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async findPhoneEncrypted(guardianId: number): Promise<Buffer | null> {
    const [row] = await this.db
      .select({ phone: guardians.phoneEncrypted })
      .from(guardians)
      .where(and(eq(guardians.id, guardianId), isNull(guardians.deletedAt)));
    return row?.phone ?? null;
  }
}
