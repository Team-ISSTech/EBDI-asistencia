import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import type { SchoolYearUsage } from '@sirai/domain';
import { and, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { ApiError } from '../../../common/errors/api-error';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { NewSchoolYear, PurgeCounts, SchoolYearRecord, SchoolYearStatus } from '../school-years.types';
import type { SchoolYearsRepository } from './school-years.repository';

const { ciclosEscolares, jornadasAsistencia, attendanceRecords, followUps } = schema;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

type Row = typeof ciclosEscolares.$inferSelect;

const toRecord = (row: Row): SchoolYearRecord => ({
  id: row.id,
  code: row.code,
  startDate: row.startDate,
  endDate: row.endDate,
  status: (row.status === 'ACTIVO' ? 'ACTIVO' : 'ARCHIVADO') satisfies SchoolYearStatus,
  archivedAt: row.archivedAt,
  purgedAt: row.purgedAt,
});

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

const affectedRows = (result: unknown): number => Number((result as [{ affectedRows?: number }])[0].affectedRows ?? 0);

@Injectable()
export class DrizzleSchoolYearsRepository implements SchoolYearsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<SchoolYearRecord[]> {
    return (await this.db.select().from(ciclosEscolares).orderBy(desc(ciclosEscolares.id))).map(toRecord);
  }

  async findById(id: number): Promise<SchoolYearRecord | null> {
    const [row] = await this.db.select().from(ciclosEscolares).where(eq(ciclosEscolares.id, id));
    return row ? toRecord(row) : null;
  }

  async findActive(): Promise<SchoolYearRecord | null> {
    const [row] = await this.db.select().from(ciclosEscolares).where(eq(ciclosEscolares.status, 'ACTIVO')).limit(1);
    return row ? toRecord(row) : null;
  }

  async usage(id: number): Promise<SchoolYearUsage> {
    const [journeys] = await this.db
      .select({ total: count() })
      .from(jornadasAsistencia)
      .where(and(eq(jornadasAsistencia.schoolYearId, id), eq(jornadasAsistencia.status, 'ABIERTA')));
    const [tickets] = await this.db
      .select({ total: count() })
      .from(followUps)
      .innerJoin(attendanceRecords, eq(attendanceRecords.id, followUps.attendanceRecordId))
      .innerJoin(jornadasAsistencia, eq(jornadasAsistencia.id, attendanceRecords.journeyId))
      .where(and(eq(jornadasAsistencia.schoolYearId, id), ne(followUps.status, 'CERRADO'), isNull(followUps.deletedAt)));
    return { openJourneys: Number(journeys?.total ?? 0), openFollowUps: Number(tickets?.total ?? 0) };
  }

  async openNew(archive: { id: number; userId: number } | null, next: NewSchoolYear, now: Date, inSameTransaction?: TransactionHook<number>): Promise<number> {
    try {
      return await this.db.transaction(async (tx) => {
        if (archive) {
          const [result] = await tx
            .update(ciclosEscolares)
            .set({ status: 'ARCHIVADO', archivedAt: now, archivedBy: archive.userId })
            .where(and(eq(ciclosEscolares.id, archive.id), eq(ciclosEscolares.status, 'ACTIVO')));
          if (result.affectedRows === 0) throw new ApiError('CONFLICTO', 'El ciclo activo cambió mientras tanto; actualiza la pantalla e intenta de nuevo.');
        }
        const [created] = await tx.insert(ciclosEscolares).values({ code: next.code, startDate: next.startDate, endDate: next.endDate, status: 'ACTIVO', createdAt: now });
        await inSameTransaction?.(tx, created.insertId);
        return created.insertId;
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Ya existe un ciclo con esa clave, o el ciclo activo cambió; actualiza la pantalla.');
      throw error;
    }
  }

  async purge(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<PurgeCounts>): Promise<PurgeCounts> {
    return this.db.transaction(async (tx) => {
      const contacts = affectedRows(
        await tx.execute(sql`
          UPDATE contactos_seguimiento c
          JOIN seguimientos s ON s.id = c.seguimiento_id
          JOIN asistencias a ON a.id = s.asistencia_id
          JOIN jornadas_asistencia j ON j.id = a.jornada_id
          SET c.telefono_destino_cifrado = NULL, c.notas_asesoria_cifradas = NULL, c.updated_at = ${now}
          WHERE j.ciclo_escolar_id = ${id} AND (c.telefono_destino_cifrado IS NOT NULL OR c.notas_asesoria_cifradas IS NOT NULL)`),
      );
      const releases = affectedRows(
        await tx.execute(sql`
          UPDATE altas_medicas m
          JOIN seguimientos s ON s.id = m.seguimiento_id
          JOIN asistencias a ON a.id = s.asistencia_id
          JOIN jornadas_asistencia j ON j.id = a.jornada_id
          SET m.observaciones_cifradas = NULL
          WHERE j.ciclo_escolar_id = ${id} AND m.observaciones_cifradas IS NOT NULL`),
      );
      await tx.update(ciclosEscolares).set({ purgedAt: now, purgedBy: userId }).where(eq(ciclosEscolares.id, id));
      const counts = { contacts, releases };
      await inSameTransaction?.(tx, counts);
      return counts;
    });
  }
}
