import { Inject, Injectable } from '@nestjs/common';
import type { OpenSchoolYearRequest, PurgeSchoolYearRequest, PurgeSchoolYearResponse, SchoolYearView } from '@sirai/contracts';
import { canArchiveSchoolYear, canPurgeSchoolYear, purgeEligibleOn } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import { SCHOOL_YEARS_REPOSITORY, type SchoolYearsRepository } from '../repositories/school-years.repository';
import type { SchoolYearRecord } from '../school-years.types';

export const SCHOOL_YEARS_CLOCK = Symbol('SCHOOL_YEARS_CLOCK');

const TABLE = 'ciclos_escolares';
const PLURAL = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/**
 * Ciclos escolares y retención (RNF-05). Abrir un ciclo nuevo archiva el actual,
 * que queda de solo lectura; un ciclo archivado se conserva 5 años y entonces el
 * administrador central puede depurarlo: se vacían los datos sensibles cifrados de sus
 * seguimientos, sin borrar filas (RNF-04), y quedan los conteos y la huella de auditoría.
 */
@Injectable()
export class SchoolYearsService {
  constructor(
    @Inject(SCHOOL_YEARS_REPOSITORY) private readonly years: SchoolYearsRepository,
    private readonly audit: AuditService,
    @Inject(SCHOOL_YEARS_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(): Promise<SchoolYearView[]> {
    const now = this.clock();
    return Promise.all((await this.years.list()).map((year) => this.toView(year, now)));
  }

  async open(auth: AuthContext, input: OpenSchoolYearRequest, request: RequestContext): Promise<SchoolYearView> {
    const current = await this.years.findActive();
    if (current) await this.assertCanArchive(current);
    const now = this.clock();
    const id = await this.years.openNew(current ? { id: current.id, userId: auth.userId } : null, input, now, async (tx, newId) => {
      if (current) {
        await this.audit.record({ ...this.actor(auth), action: 'CICLO_ARCHIVADO', tableName: TABLE, recordId: String(current.id), before: { code: current.code, status: current.status }, after: { status: 'ARCHIVADO' }, request }, tx);
      }
      await this.audit.record({ ...this.actor(auth), action: 'CICLO_ABIERTO', tableName: TABLE, recordId: String(newId), after: { code: input.code, startDate: input.startDate, endDate: input.endDate }, request }, tx);
    });
    return this.toView(await this.require(id), now);
  }

  /** Irreversible: vacía datos sensibles. Exige 5 años cumplidos y que se escriba la clave del ciclo. */
  async purge(auth: AuthContext, id: number, input: PurgeSchoolYearRequest, request: RequestContext): Promise<PurgeSchoolYearResponse> {
    const year = await this.require(id);
    const now = this.clock();
    const check = canPurgeSchoolYear(year, now);
    if (!check.ok) throw new ApiError('CONFLICTO', this.purgeMessage(check.reason, year));
    if (input.confirmCode.trim() !== year.code) throw new ApiError('DATOS_INVALIDOS', 'La confirmación no coincide con la clave del ciclo.');
    return this.years.purge(id, auth.userId, now, (tx, counts) =>
      this.audit.record({ ...this.actor(auth), action: 'CICLO_DEPURADO', tableName: TABLE, recordId: String(id), after: { code: year.code, ...counts }, request }, tx),
    );
  }

  private async assertCanArchive(current: SchoolYearRecord): Promise<void> {
    const usage = await this.years.usage(current.id);
    const check = canArchiveSchoolYear(usage);
    if (check.ok) return;
    const detail =
      check.reason === 'CON_JORNADAS_ABIERTAS'
        ? PLURAL(usage.openJourneys, 'jornada abierta', 'jornadas abiertas')
        : PLURAL(usage.openFollowUps, 'seguimiento sin cerrar', 'seguimientos sin cerrar');
    throw new ApiError('CONFLICTO', `No se puede cerrar el ciclo ${current.code}: tiene ${detail}. Ciérralos antes; un ciclo archivado es de solo lectura.`);
  }

  private purgeMessage(reason: 'NO_ARCHIVADO' | 'ANTES_DE_TIEMPO' | 'YA_DEPURADO', year: SchoolYearRecord): string {
    if (reason === 'NO_ARCHIVADO') return `El ciclo ${year.code} no está archivado: solo se depuran ciclos archivados.`;
    if (reason === 'YA_DEPURADO') return `El ciclo ${year.code} ya se depuró.`;
    const from = year.archivedAt ? purgeEligibleOn(year.archivedAt).toISOString().slice(0, 10) : '';
    return `El ciclo ${year.code} se conserva 5 años desde que se archivó: podrá depurarse a partir del ${from}.`;
  }

  private async toView(year: SchoolYearRecord, now: Date): Promise<SchoolYearView> {
    return {
      id: year.id,
      code: year.code,
      startDate: year.startDate,
      endDate: year.endDate,
      status: year.status,
      archivedAt: year.archivedAt?.toISOString() ?? null,
      purgeEligibleOn: year.archivedAt ? purgeEligibleOn(year.archivedAt).toISOString() : null,
      purgedAt: year.purgedAt?.toISOString() ?? null,
      canPurge: canPurgeSchoolYear(year, now).ok,
      usage: year.status === 'ACTIVO' ? await this.years.usage(year.id) : null,
    };
  }

  private async require(id: number): Promise<SchoolYearRecord> {
    const year = await this.years.findById(id);
    if (!year) throw new ApiError('NO_ENCONTRADO', 'Ciclo escolar no encontrado.');
    return year;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }
}
