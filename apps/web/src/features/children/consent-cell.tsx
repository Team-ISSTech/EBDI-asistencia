import type { Consent } from '@sirai/contracts';
import { CONSENT_TYPES, type ConsentStatus, type ConsentType, canRevoke, currentConsentStatus } from '@sirai/domain';
import { Badge, type BadgeTone, Button } from '@sirai/ui';
import { ApiClientError } from '../../lib/api-client';
import { useConsentActions } from './use-consents';

/**
 * Versión vigente del aviso de privacidad que el tutor firmó en papel.
 * Pendiente de confirmar con el área jurídica; mientras tanto es un valor fijo.
 */
export const NOTICE_VERSION = 'AP-2026-1';

const TYPE_LABELS: Readonly<Record<ConsentType, string>> = {
  TRATAMIENTO_DATOS_SENSIBLES: 'Datos sensibles',
  CONTACTO_TELEFONICO: 'Contacto telefónico',
};

const STATUS_LABELS: Readonly<Record<ConsentStatus, string>> = {
  PENDIENTE: 'Pendiente',
  ACEPTADO: 'Aceptado',
  RECHAZADO: 'Rechazado',
  REVOCADO: 'Revocado',
};

const STATUS_TONES: Readonly<Record<ConsentStatus, BadgeTone>> = {
  PENDIENTE: 'neutral',
  ACEPTADO: 'success',
  RECHAZADO: 'danger',
  REVOCADO: 'danger',
};

const toFact = (consent: Consent) => ({ type: consent.type, accepted: consent.accepted, acceptedAt: consent.acceptedAt, revokedAt: consent.revokedAt });

/** La aceptación vigente más reciente del tipo, la única que se puede revocar. */
const revocable = (consents: readonly Consent[], type: ConsentType): Consent | undefined =>
  [...consents]
    .filter((consent) => consent.type === type && canRevoke(toFact(consent)))
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))[0];

export interface ConsentCellProps {
  readonly childId: number;
  readonly guardianId: number;
  /** Historial del tutor con este infante. */
  readonly consents: readonly Consent[];
  readonly canManage: boolean;
}

/** Estado de cada consentimiento del tutor y, para quien puede, su registro o revocación. */
export function ConsentCell({ childId, guardianId, consents, canManage }: ConsentCellProps) {
  const { register, revoke } = useConsentActions(childId);
  const error = register.error ?? revoke.error;
  const busy = register.isPending || revoke.isPending;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {CONSENT_TYPES.map((type) => {
          const status = currentConsentStatus(consents.map(toFact), type);
          const active = revocable(consents, type);
          return (
            <li key={type} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--color-ink)]">{TYPE_LABELS[type]}</span>
              <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
              {canManage && active ? (
                <Button variant="ghost" disabled={busy} onClick={() => revoke.mutate(active.id)}>
                  Revocar
                </Button>
              ) : null}
              {canManage && !active ? (
                <Button variant="ghost" disabled={busy} onClick={() => register.mutate({ guardianId, type, noticeVersion: NOTICE_VERSION, accepted: true })}>
                  Registrar aceptación
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error instanceof ApiClientError ? error.message : 'No se pudo guardar el consentimiento.'}
        </p>
      ) : null}
    </div>
  );
}
