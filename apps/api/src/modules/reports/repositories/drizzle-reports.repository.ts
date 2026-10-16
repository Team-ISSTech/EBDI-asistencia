import { Inject, Injectable } from '@nestjs/common';
import { ABSENCE_STATUSES } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module.js';
import type { EstanciaFacts, ReportScope } from '../reports.types.js';
import type { ReportsRepository } from './reports.repository.js';

const { estancias, jornadasAsistencia, attendanceRecords, enrollments, rooms, children } = schema;

/** Filtro de estancias según el alcance; un alcance vacío no deja pasar ninguna. */
const scopeFilter = (scope: ReportScope): SQL | undefined => {
  if (scope.kind === 'ALL') return undefined;
  const conditions: SQL[] = [];
  if (scope.regions.length > 0) conditions.push(inArray(estancias.region, [...scope.regions]));
  if (scope.estanciaIds.length > 0) conditions.push(inArray(estancias.id, [...scope.estanciaIds]));
  return conditions.length === 0 ? sql`1 = 0` : or(...conditions);
};

const count = (value: unknown): number => Number(value ?? 0);

/**
 * Conteos por estancia con pocas consultas agrupadas (no una por estancia),
 * para que el tablero de las 212 estancias responda rápido.
 */
@Injectable()
export class DrizzleReportsRepository implements ReportsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async dashboardFacts(date: string, scope: ReportScope): Promise<EstanciaFacts[]> {
    const base = await this.db
      .select({ id: estancias.id, code: estancias.ebdiCode, name: estancias.name, region: estancias.region })
      .from(estancias)
      .where(and(eq(estancias.status, 'ACTIVA'), isNull(estancias.deletedAt), scopeFilter(scope)))
      .orderBy(asc(estancias.name));
    if (base.length === 0) return [];
    const ids = base.map((row) => row.id);
    const journeys = await this.db
      .select({ id: jornadasAsistencia.id, estanciaId: jornadasAsistencia.estanciaId, shift: jornadasAsistencia.shift })
      .from(jornadasAsistencia)
      .where(and(eq(jornadasAsistencia.date, date), inArray(jornadasAsistencia.estanciaId, ids)));
    const shiftsByEstancia = new Map<number, Set<string>>();
    for (const journey of journeys) shiftsByEstancia.set(journey.estanciaId, (shiftsByEstancia.get(journey.estanciaId) ?? new Set()).add(journey.shift));
    const enrolled = await this.enrolledByEstanciaAndShift(ids);
    const marks = await this.marksByEstancia(journeys.map((journey) => journey.id));
    return base.map((row) => {
      const shifts = shiftsByEstancia.get(row.id) ?? new Set<string>();
      const counted = marks.get(row.id);
      return {
        estanciaId: row.id,
        code: row.code,
        name: row.name,
        region: row.region,
        hasJourney: shifts.size > 0,
        enrolled: [...shifts].reduce((total, shift) => total + (enrolled.get(`${row.id}:${shift}`) ?? 0), 0),
        present: counted?.present ?? 0,
        absent: counted?.absent ?? 0,
        other: counted?.other ?? 0,
      };
    });
  }

  /** Inscritos activos por estancia y turno de su sala. */
  private async enrolledByEstanciaAndShift(estanciaIds: readonly number[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ estanciaId: enrollments.estanciaId, shift: rooms.shift, total: sql<number>`COUNT(*)` })
      .from(enrollments)
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .innerJoin(children, eq(children.id, enrollments.childId))
      .where(and(inArray(enrollments.estanciaId, [...estanciaIds]), eq(enrollments.status, 'ACTIVA'), isNull(enrollments.deletedAt), isNull(children.deletedAt)))
      .groupBy(enrollments.estanciaId, rooms.shift);
    return new Map(rows.map((row) => [`${row.estanciaId}:${row.shift}`, count(row.total)]));
  }

  /** Presentes, ausentes y otros estados de las jornadas dadas, por estancia. */
  private async marksByEstancia(journeyIds: readonly number[]): Promise<Map<number, { present: number; absent: number; other: number }>> {
    const result = new Map<number, { present: number; absent: number; other: number }>();
    if (journeyIds.length === 0) return result;
    const rows = await this.db
      .select({ estanciaId: jornadasAsistencia.estanciaId, status: attendanceRecords.status, total: sql<number>`COUNT(*)` })
      .from(attendanceRecords)
      .innerJoin(jornadasAsistencia, eq(jornadasAsistencia.id, attendanceRecords.journeyId))
      .where(inArray(attendanceRecords.journeyId, [...journeyIds]))
      .groupBy(jornadasAsistencia.estanciaId, attendanceRecords.status);
    for (const row of rows) {
      const current = result.get(row.estanciaId) ?? { present: 0, absent: 0, other: 0 };
      const total = count(row.total);
      if (row.status === 'PRESENTE') current.present += total;
      else if ((ABSENCE_STATUSES as readonly string[]).includes(row.status)) current.absent += total;
      else current.other += total;
      result.set(row.estanciaId, current);
    }
    return result;
  }
}
