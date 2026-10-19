/** Años que un ciclo archivado se conserva antes de poder depurarse (RNF-05). */
export const RETENTION_YEARS = 5;

export interface SchoolYearUsage {
  readonly openJourneys: number;
  readonly openFollowUps: number;
}

export type ArchiveCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'CON_JORNADAS_ABIERTAS' | 'CON_SEGUIMIENTOS_ABIERTOS' };

/**
 * Un ciclo solo se archiva cuando todo lo suyo está cerrado. Archivarlo lo deja de
 * solo lectura, así que lo que quede abierto ya no se podría cerrar.
 */
export function canArchiveSchoolYear(usage: SchoolYearUsage): ArchiveCheck {
  if (usage.openJourneys > 0) return { ok: false, reason: 'CON_JORNADAS_ABIERTAS' };
  if (usage.openFollowUps > 0) return { ok: false, reason: 'CON_SEGUIMIENTOS_ABIERTOS' };
  return { ok: true };
}

/** Primer instante en que un ciclo archivado en `archivedAt` puede depurarse: cinco años calendario después. */
export function purgeEligibleOn(archivedAt: Date): Date {
  const eligible = new Date(archivedAt.getTime());
  const month = eligible.getUTCMonth();
  eligible.setUTCFullYear(eligible.getUTCFullYear() + RETENTION_YEARS);
  // Un 29 de febrero cae en el 1 de marzo si el año destino no es bisiesto: se vuelve al último día de febrero.
  if (eligible.getUTCMonth() !== month) eligible.setUTCDate(0);
  return eligible;
}

export const isPurgeEligible = (archivedAt: Date, now: Date): boolean => now >= purgeEligibleOn(archivedAt);

export interface SchoolYearLifecycle {
  readonly status: 'ACTIVO' | 'ARCHIVADO';
  readonly archivedAt: Date | null;
  readonly purgedAt: Date | null;
}

export type PurgeCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'NO_ARCHIVADO' | 'ANTES_DE_TIEMPO' | 'YA_DEPURADO' };

/** La depuración exige un ciclo archivado, con 5 años cumplidos y que no se haya depurado ya. */
export function canPurgeSchoolYear(year: SchoolYearLifecycle, now: Date): PurgeCheck {
  if (year.status !== 'ARCHIVADO' || year.archivedAt === null) return { ok: false, reason: 'NO_ARCHIVADO' };
  if (year.purgedAt !== null) return { ok: false, reason: 'YA_DEPURADO' };
  return isPurgeEligible(year.archivedAt, now) ? { ok: true } : { ok: false, reason: 'ANTES_DE_TIEMPO' };
}
