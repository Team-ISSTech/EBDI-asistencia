import { Inject, Injectable } from '@nestjs/common';
import { isJourneyStatus, isShift, type JourneyStatus, type Shift } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { AttendanceJourneyRecord } from '../attendance.types.js';
import type { AttendanceJourneysRepository, JourneyTransactionHook } from './repositories.js';

const { jornadasAsistencia, ciclosEscolares } = schema;
type Row = typeof jornadasAsistencia.$inferSelect;

const requireStatus = (status: string): JourneyStatus => {
  if (!isJourneyStatus(status)) throw new Error(`Estado de jornada no reconocido: ${status}`);
  return status;
};
const requireShift = (shift: string): Shift => {
  if (!isShift(shift)) throw new Error(`Turno de jornada no reconocido: ${shift}`);
  return shift;
};
/** El ciclo escolar es de la base (retención); la jornada del dominio no lo expone. */
const toRecord = ({ schoolYearId: _schoolYearId, ...row }: Row): AttendanceJourneyRecord => ({ ...row, shift: requireShift(row.shift), status: requireStatus(row.status) });
const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

@Injectable()
export class DrizzleAttendanceJourneysRepository implements AttendanceJourneysRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findById(id: number, estanciaId: number): Promise<AttendanceJourneyRecord | null> {
    const [row] = await this.db.select().from(jornadasAsistencia).where(and(eq(jornadasAsistencia.id, id), eq(jornadasAsistencia.estanciaId, estanciaId)));
    return row ? toRecord(row) : null;
  }

  async findByKey(estanciaId: number, date: string, shift: Shift): Promise<AttendanceJourneyRecord | null> {
    const [row] = await this.db.select().from(jornadasAsistencia).where(and(eq(jornadasAsistencia.estanciaId, estanciaId), eq(jornadasAsistencia.date, date), eq(jornadasAsistencia.shift, shift)));
    return row ? toRecord(row) : null;
  }

  async create(input: Omit<AttendanceJourneyRecord, 'id' | 'status' | 'closedAt' | 'closedBy'>, hook?: JourneyTransactionHook<number>): Promise<AttendanceJourneyRecord> {
    try {
      const id = await this.db.transaction(async (tx) => {
        const schoolYearId = await this.activeSchoolYearId(tx);
        const [result] = await tx.insert(jornadasAsistencia).values({ ...input, schoolYearId, createdAt: input.openedAt });
        await hook?.(tx, result.insertId);
        return result.insertId;
      });
      const record = await this.findById(id, input.estanciaId);
      if (!record) throw new Error('No se pudo recuperar la jornada creada.');
      return record;
    } catch (error) {
      if (driverCode(error) === 'ER_DUP_ENTRY') throw new ApiError('CONFLICTO', 'Ya existe una jornada para esa estancia, fecha y turno.');
      throw error;
    }
  }

  /** Toda jornada pertenece al ciclo escolar activo: de ahí depende su archivo histórico (RNF-05). */
  private async activeSchoolYearId(executor: Pick<Db, 'select'>): Promise<number> {
    const [row] = await executor.select({ id: ciclosEscolares.id }).from(ciclosEscolares).where(eq(ciclosEscolares.status, 'ACTIVO')).limit(1);
    if (!row) throw new ApiError('CONFLICTO', 'No hay un ciclo escolar activo.');
    return row.id;
  }

  async close(id: number, estanciaId: number, closedBy: number, closedAt: Date, hook?: JourneyTransactionHook<void>): Promise<AttendanceJourneyRecord | null> {
    const changed = await this.db.transaction(async (tx) => {
      const [result] = await tx.update(jornadasAsistencia).set({ status: 'CERRADA', closedBy, closedAt }).where(and(eq(jornadasAsistencia.id, id), eq(jornadasAsistencia.estanciaId, estanciaId), eq(jornadasAsistencia.status, 'ABIERTA')));
      if (result.affectedRows === 0) return false;
      await hook?.(tx, undefined);
      return true;
    });
    if (!changed) return null;
    return this.findById(id, estanciaId);
  }
}
