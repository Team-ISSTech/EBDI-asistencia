import type { Child, Consent } from '@sirai/contracts';
import { Button, Card, EmptyState, Table, Th } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../auth/use-session';
import { AddGuardianForm } from './add-guardian-form';
import { GuardianRow } from './guardian-row';
import { useChildConsents } from './use-consents';
import { useAddGuardian, useChildGuardians } from './use-guardians';

interface GuardiansListProps {
  readonly childId: number;
  readonly query: ReturnType<typeof useChildGuardians>;
  readonly consents: readonly Consent[];
  readonly canSeePhone: boolean;
  readonly canManageConsent: boolean;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function GuardiansList({ childId, query, consents, canSeePhone, canManageConsent }: GuardiansListProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando tutores…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudieron cargar los tutores.
      </p>
    );
  }
  if (query.data.guardians.length === 0) {
    return <EmptyState title="Sin tutores vinculados" description="Agrega al menos un tutor con teléfono para poder contactarlo si el infante falta." />;
  }
  return (
    <Table>
      <thead>
        <tr>
          <Th>Tutor</Th>
          <Th>Parentesco</Th>
          <Th>Permisos</Th>
          <Th>Teléfono</Th>
          <Th>Consentimiento</Th>
        </tr>
      </thead>
      <tbody>
        {query.data.guardians.map((guardian) => (
          <GuardianRow key={guardian.id} childId={childId} guardian={guardian} canSeePhone={canSeePhone} canManageConsent={canManageConsent} consents={consents} />
        ))}
      </tbody>
    </Table>
  );
}

export interface GuardiansCardProps {
  readonly child: Child;
  readonly onClose: () => void;
}

/** Tutores de un infante. El alta y el teléfono dependen de los permisos de la sesión. */
export function GuardiansCard({ child, onClose }: GuardiansCardProps) {
  const { data: session } = useSession();
  const guardians = useChildGuardians(child.id);
  const consents = useChildConsents(child.id);
  const add = useAddGuardian(child.id);
  const [showForm, setShowForm] = useState(false);
  const permissions = session?.permissions ?? [];

  const toggleForm = () => {
    add.reset();
    setShowForm((visible) => !visible);
  };

  return (
    <Card className="mb-8 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Tutores de {child.name} {child.paternalSurname}</h2>
        <div className="flex gap-2">
          {permissions.includes('INFANTE_ADMINISTRAR') ? (
            <Button onClick={toggleForm}>{showForm ? 'Cancelar' : 'Agregar tutor'}</Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
      {showForm ? (
        <AddGuardianForm pending={add.isPending} error={add.error} onSubmit={(input) => add.mutate(input, { onSuccess: () => setShowForm(false) })} />
      ) : null}
      {consents.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo cargar el estado de consentimiento.
        </p>
      ) : null}
      <GuardiansList
        childId={child.id}
        query={guardians}
        consents={consents.data?.consents ?? []}
        canSeePhone={permissions.includes('NOTA_SENSIBLE_CONSULTAR')}
        canManageConsent={permissions.includes('CONSENTIMIENTO_REGISTRAR')}
      />
    </Card>
  );
}
