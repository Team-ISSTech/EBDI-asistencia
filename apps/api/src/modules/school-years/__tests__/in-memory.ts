import { ApiError } from '../../../common/errors/api-error';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { NewSchoolYear, PurgeCounts, SchoolYearRecord } from '../school-years.types';
import type { SchoolYearsRepository } from '../repositories/school-years.repository';

const executor = {} as Parameters<TransactionHook<unknown>>[0];

export class InMemorySchoolYears implements SchoolYearsRepository {
  readonly rows = new Map<number, SchoolYearRecord>();
  readonly usages = new Map<number, { openJourneys: number; openFollowUps: number }>();
  readonly purged: { id: number; userId: number }[] = [];
  readonly archivedBy: { id: number; userId: number }[] = [];
  /** Lo que "existe" para vaciar en cada ciclo, para probar los conteos. */
  readonly sensitive = new Map<number, PurgeCounts>();
  private nextId = 1;

  seed(year: Omit<SchoolYearRecord, 'id'>): SchoolYearRecord {
    const record = { ...year, id: this.nextId++ };
    this.rows.set(record.id, record);
    return record;
  }

  list(): Promise<SchoolYearRecord[]> {
    return Promise.resolve([...this.rows.values()].sort((a, b) => b.id - a.id));
  }

  findById(id: number): Promise<SchoolYearRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findActive(): Promise<SchoolYearRecord | null> {
    return Promise.resolve([...this.rows.values()].find((row) => row.status === 'ACTIVO') ?? null);
  }

  usage(id: number): Promise<{ openJourneys: number; openFollowUps: number }> {
    return Promise.resolve(this.usages.get(id) ?? { openJourneys: 0, openFollowUps: 0 });
  }

  async openNew(archive: { id: number; userId: number } | null, next: NewSchoolYear, now: Date, inSameTransaction?: TransactionHook<number>): Promise<number> {
    if ([...this.rows.values()].some((row) => row.code === next.code)) throw new ApiError('CONFLICTO', 'Ya existe un ciclo con esa clave.');
    if (archive) {
      const current = this.rows.get(archive.id);
      if (current) this.rows.set(archive.id, { ...current, status: 'ARCHIVADO', archivedAt: now });
      this.archivedBy.push(archive);
    }
    const created = this.seed({ ...next, status: 'ACTIVO', archivedAt: null, purgedAt: null });
    await inSameTransaction?.(executor, created.id);
    return created.id;
  }

  async purge(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<PurgeCounts>): Promise<PurgeCounts> {
    const counts = this.sensitive.get(id) ?? { contacts: 0, releases: 0 };
    const current = this.rows.get(id);
    if (current) this.rows.set(id, { ...current, purgedAt: now });
    this.purged.push({ id, userId });
    this.sensitive.set(id, { contacts: 0, releases: 0 });
    await inSameTransaction?.(executor, counts);
    return counts;
  }
}
