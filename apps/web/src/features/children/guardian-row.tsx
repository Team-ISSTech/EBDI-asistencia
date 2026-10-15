import type { ChildGuardian, Consent } from '@sirai/contracts';
import { Badge, Button, Td } from '@sirai/ui';
import { ConsentCell } from './consent-cell';
import { useRevealPhone } from './use-guardians';

const fullName = (guardian: ChildGuardian): string =>
  [guardian.name, guardian.paternalSurname, guardian.maternalSurname].filter((part): part is string => Boolean(part)).join(' ');

/** 5512345678 → 55 1234 5678 */
const formatPhone = (digits: string): string => `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;

interface PhoneCellProps {
  readonly guardianId: number;
}

/** El número se pide al servidor solo al pulsar, y cada consulta queda auditada allá. */
function PhoneCell({ guardianId }: PhoneCellProps) {
  const reveal = useRevealPhone();
  if (reveal.data) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-medium text-[var(--color-ink)]">{formatPhone(reveal.data.phone)}</span>
        <Button variant="ghost" onClick={() => reveal.reset()}>
          Ocultar teléfono
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="ghost" loading={reveal.isPending} onClick={() => reveal.mutate(guardianId)}>
        Ver teléfono
      </Button>
      {reveal.isError ? (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          No se pudo consultar el teléfono.
        </p>
      ) : null}
    </div>
  );
}

export interface GuardianRowProps {
  readonly childId: number;
  readonly guardian: ChildGuardian;
  readonly canSeePhone: boolean;
  readonly canManageConsent: boolean;
  /** Historial de consentimientos del infante; solo se muestran los de este tutor. */
  readonly consents: readonly Consent[];
}

export function GuardianRow({ childId, guardian, canSeePhone, canManageConsent, consents }: GuardianRowProps) {
  return (
    <tr>
      <Td className="font-medium text-[var(--color-ink)]">{fullName(guardian)}</Td>
      <Td>{guardian.relationship}</Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {guardian.isPrimary ? <Badge tone="accent">Principal</Badge> : null}
          {guardian.canPickUp ? <Badge tone="success">Puede recoger</Badge> : null}
          {guardian.isEmergencyContact ? <Badge tone="danger">Contacto de emergencia</Badge> : null}
        </div>
      </Td>
      <Td>{canSeePhone && guardian.hasPhone ? <PhoneCell guardianId={guardian.id} /> : null}</Td>
      <Td>
        <ConsentCell
          childId={childId}
          guardianId={guardian.id}
          consents={consents.filter((consent) => consent.guardianId === guardian.id)}
          canManage={canManageConsent}
        />
      </Td>
    </tr>
  );
}
