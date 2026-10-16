import type { Child } from '@sirai/contracts';
import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../../auth/use-session';
import { ChildrenTable } from '../children-table';
import { EnrollChildForm } from '../enroll-child-form';
import { GuardiansCard } from '../guardians-card';
import { useChildren, useEnrollChild, useRooms } from '../use-children';
import { useDownloadDossier } from '../use-dossier';
import { VerifyDossierCard } from '../verify-dossier-card';

interface ChildrenContentProps {
  readonly query: ReturnType<typeof useChildren>;
  readonly onSelect: (child: Child) => void;
  readonly onExport: ((child: Child) => void) | undefined;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function ChildrenContent({ query, onSelect, onExport }: ChildrenContentProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando infantes…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar el padrón de infantes.
      </p>
    );
  }
  if (query.data.children.length === 0) {
    return <EmptyState title="Sin infantes registrados" description="Cuando se den de alta infantes en la estancia, aparecerán aquí con su sala." />;
  }
  return <ChildrenTable children={query.data.children} onSelect={onSelect} {...(onExport ? { onExport } : {})} />;
}

interface HeaderActionsProps {
  readonly canEnroll: boolean;
  readonly canExport: boolean;
  readonly showForm: boolean;
  readonly showVerify: boolean;
  readonly onToggleForm: () => void;
  readonly onToggleVerify: () => void;
}

/** Los botones del encabezado dependen de los permisos de la sesión. */
function HeaderActions({ canEnroll, canExport, showForm, showVerify, onToggleForm, onToggleVerify }: HeaderActionsProps) {
  if (!canEnroll && !canExport) return null;
  return (
    <div className="flex gap-2">
      {canExport ? (
        <Button variant="ghost" onClick={onToggleVerify}>
          {showVerify ? 'Ocultar verificación' : 'Verificar expediente'}
        </Button>
      ) : null}
      {canEnroll ? <Button onClick={onToggleForm}>{showForm ? 'Cancelar' : 'Nuevo infante'}</Button> : null}
    </div>
  );
}

function DossierError({ failed }: { readonly failed: boolean }) {
  if (!failed) return null;
  return (
    <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">
      No se pudo generar el expediente.
    </p>
  );
}

/** Padrón de infantes de la estancia activa, con alta y expediente para quien puede. */
export function ChildrenPage() {
  const { data: session } = useSession();
  const children = useChildren();
  const enroll = useEnrollChild();
  const dossier = useDownloadDossier();
  const [showForm, setShowForm] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [selected, setSelected] = useState<Child | null>(null);
  const rooms = useRooms(showForm);
  const permissions = session?.permissions ?? [];
  const canExport = permissions.includes('EXPEDIENTE_EXPORTAR');

  const toggleForm = () => {
    enroll.reset();
    setShowForm((visible) => !visible);
  };

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Infantes"
        description="Padrón de infantes inscritos en la estancia, con su sala. Los datos de salud no se muestran aquí."
        actions={<HeaderActions canEnroll={permissions.includes('INFANTE_ADMINISTRAR')} canExport={canExport} showForm={showForm} showVerify={showVerify} onToggleForm={toggleForm} onToggleVerify={() => setShowVerify((visible) => !visible)} />}
      />
      {showVerify && canExport ? <VerifyDossierCard /> : null}
      {showForm ? (
        <Card className="mb-8">
          <EnrollChildForm
            rooms={rooms.data?.rooms ?? []}
            pending={enroll.isPending}
            error={enroll.error}
            onSubmit={(body) => enroll.mutate(body, { onSuccess: () => setShowForm(false) })}
          />
        </Card>
      ) : null}
      <DossierError failed={dossier.isError} />
      {selected ? <GuardiansCard key={selected.id} child={selected} onClose={() => setSelected(null)} /> : null}
      <ChildrenContent query={children} onSelect={setSelected} onExport={canExport ? (child) => dossier.mutate(child.id) : undefined} />
    </>
  );
}
