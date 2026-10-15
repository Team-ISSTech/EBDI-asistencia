import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../../auth/use-session';
import { ChildrenTable } from '../children-table';
import { EnrollChildForm } from '../enroll-child-form';
import { useChildren, useEnrollChild, useRooms } from '../use-children';

interface ChildrenContentProps {
  readonly query: ReturnType<typeof useChildren>;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function ChildrenContent({ query }: ChildrenContentProps) {
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
  return <ChildrenTable children={query.data.children} />;
}

/** Padrón de infantes de la estancia activa, con alta para quien puede administrarlo. */
export function ChildrenPage() {
  const { data: session } = useSession();
  const children = useChildren();
  const enroll = useEnrollChild();
  const [showForm, setShowForm] = useState(false);
  const rooms = useRooms(showForm);
  const canEnroll = session?.permissions.includes('INFANTE_ADMINISTRAR') ?? false;

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
        actions={canEnroll ? <Button onClick={toggleForm}>{showForm ? 'Cancelar' : 'Nuevo infante'}</Button> : undefined}
      />
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
      <ChildrenContent query={children} />
    </>
  );
}
