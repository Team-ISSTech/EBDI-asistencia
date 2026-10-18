import type { ChildGuardian, Consent } from '@sirai/contracts';
import { Table, Th } from '@sirai/ui';
import { GuardianRow } from './guardian-row';

export interface GuardiansTableProps {
  readonly childId: number;
  readonly guardians: readonly ChildGuardian[];
  readonly consents: readonly Consent[];
  readonly canSeePhone: boolean;
  readonly canManageConsent: boolean;
  readonly onEdit?: (guardian: ChildGuardian) => void;
  readonly onUnlink?: (guardian: ChildGuardian) => void;
}

export function GuardiansTable({ childId, guardians, consents, canSeePhone, canManageConsent, onEdit, onUnlink }: GuardiansTableProps) {
  const manage = onEdit && onUnlink ? { onEdit, onUnlink } : {};
  return (
    <Table>
      <thead>
        <tr>
          <Th>Tutor</Th>
          <Th>Parentesco</Th>
          <Th>Permisos</Th>
          <Th>Teléfono</Th>
          <Th>Consentimiento</Th>
          {onEdit ? (
            <Th>
              <span className="sr-only">Acciones</span>
            </Th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {guardians.map((guardian) => (
          <GuardianRow key={guardian.id} childId={childId} guardian={guardian} canSeePhone={canSeePhone} canManageConsent={canManageConsent} consents={consents} {...manage} />
        ))}
      </tbody>
    </Table>
  );
}
