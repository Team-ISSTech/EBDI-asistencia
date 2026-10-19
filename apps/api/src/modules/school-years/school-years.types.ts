export type SchoolYearStatus = 'ACTIVO' | 'ARCHIVADO';

export interface SchoolYearRecord {
  readonly id: number;
  readonly code: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: SchoolYearStatus;
  readonly archivedAt: Date | null;
  readonly purgedAt: Date | null;
}

export interface NewSchoolYear {
  readonly code: string;
  readonly startDate: string;
  readonly endDate: string;
}

export interface PurgeCounts {
  readonly contacts: number;
  readonly releases: number;
}
