/**
 * Consentimientos del tutor (SRS, protección de datos de menores). Cada
 * aceptación o rechazo es un registro; revocar marca `revokedAt` y nunca
 * borra, para conservar la evidencia.
 */
export const CONSENT_TYPES = ['TRATAMIENTO_DATOS_SENSIBLES', 'CONTACTO_TELEFONICO'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_STATUSES = ['PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'REVOCADO'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const isConsentType = (value: string): value is ConsentType => (CONSENT_TYPES as readonly string[]).includes(value);

export interface ConsentFact {
  readonly type: ConsentType;
  readonly accepted: boolean;
  /** Instante ISO 8601 en que se registró. */
  readonly acceptedAt: string;
  readonly revokedAt: string | null;
}

/** Estado vigente de un tipo: manda el registro más reciente de ese tipo. */
export function currentConsentStatus(facts: readonly ConsentFact[], type: ConsentType): ConsentStatus {
  const latest = facts
    .filter((fact) => fact.type === type)
    .reduce<ConsentFact | null>((best, fact) => (best === null || fact.acceptedAt >= best.acceptedAt ? fact : best), null);
  if (latest === null) return 'PENDIENTE';
  if (!latest.accepted) return 'RECHAZADO';
  return latest.revokedAt === null ? 'ACEPTADO' : 'REVOCADO';
}

export const canRevoke = (fact: Pick<ConsentFact, 'accepted' | 'revokedAt'>): boolean => fact.accepted && fact.revokedAt === null;
