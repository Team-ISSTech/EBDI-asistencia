import type { Child, ChildGuardian } from '@sirai/contracts';
import { Button, Card, EmptyState } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../auth/use-session';
import { GuardianPanel, type GuardianPanelState } from './guardian-panel';
import { GuardiansTable, type GuardiansTableProps } from './guardians-table';
import { useChildConsents } from './use-consents';
import { useChildGuardians } from './use-guardians';

interface GuardiansListProps extends Omit<GuardiansTableProps, 'guardians'> {
  readonly query: ReturnType<typeof useChildGuardians>;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function GuardiansList({ query, ...table }: GuardiansListProps) {
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
  return <GuardiansTable guardians={query.data.guardians} {...table} />;
}

interface HeaderProps {
  readonly child: Child;
  readonly canManage: boolean;
  readonly adding: boolean;
  readonly onToggleAdd: () => void;
  readonly onClose: () => void;
}

function GuardiansHeader({ child, canManage, adding, onToggleAdd, onClose }: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Tutores de {child.name} {child.paternalSurname}</h2>
      <div className="flex gap-2">
        {canManage ? <Button onClick={onToggleAdd}>{adding ? 'Cancelar' : 'Agregar tutor'}</Button> : null}
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

export interface GuardiansCardProps {
  readonly child: Child;
  readonly onClose: () => void;
}

/** Tutores de un infante. El alta, la edición y el teléfono dependen de los permisos de la sesión. */
export function GuardiansCard({ child, onClose }: GuardiansCardProps) {
  const { data: session } = useSession();
  const guardians = useChildGuardians(child.id);
  const consents = useChildConsents(child.id);
  const [panel, setPanel] = useState<GuardianPanelState | null>(null);
  const permissions = session?.permissions ?? [];
  const canManage = permissions.includes('INFANTE_ADMINISTRAR');
  const closePanel = () => setPanel(null);

  return (
    <Card className="mb-8 flex flex-col gap-4">
      <GuardiansHeader
        child={child}
        canManage={canManage}
        adding={panel?.kind === 'add'}
        onToggleAdd={() => setPanel(panel?.kind === 'add' ? null : { kind: 'add' })}
        onClose={onClose}
      />
      {panel ? <GuardianPanel child={child} state={panel} onDone={closePanel} onCancel={closePanel} /> : null}
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
        {...(canManage ? { onEdit: (guardian: ChildGuardian) => setPanel({ kind: 'edit', guardian }), onUnlink: (guardian: ChildGuardian) => setPanel({ kind: 'unlink', guardian }) } : {})}
      />
    </Card>
  );
}
