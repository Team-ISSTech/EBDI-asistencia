import type { CreatedSystemResponse, SystemView } from '@sirai/contracts';
import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { ConfirmCard } from '../../../components/confirm-card';
import { NewSystemCredentials } from '../new-system-credentials';
import { SystemForm } from '../system-form';
import { SystemsTable } from '../systems-table';
import { useSystemActions, useSystems } from '../use-systems';

interface ListProps {
  readonly query: ReturnType<typeof useSystems>;
  readonly onRevoke: (system: SystemView) => void;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function SystemsList({ query, onRevoke }: ListProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando sistemas…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar la lista de sistemas.
      </p>
    );
  }
  if (query.data.systems.length === 0) {
    return <EmptyState title="Aún no hay sistemas registrados" description="Registra un sistema externo para darle credenciales con las que consultar la API." />;
  }
  return <SystemsTable systems={query.data.systems} onRevoke={onRevoke} />;
}

/** Sistemas externos que usan la API con Bearer token (RF-37): alta, consulta y revocación. */
export function SystemsPage() {
  const systems = useSystems();
  const { create, revoke } = useSystemActions();
  const [showForm, setShowForm] = useState(false);
  const [credentials, setCredentials] = useState<CreatedSystemResponse | null>(null);
  const [revoking, setRevoking] = useState<SystemView | null>(null);

  const toggleForm = () => {
    create.reset();
    setShowForm((visible) => !visible);
  };
  const startRevoke = (system: SystemView) => {
    revoke.reset();
    setRevoking(system);
  };

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Sistemas"
        description="Sistemas externos que se conectan a la API con credenciales propias. Cada uno tiene solo los alcances que se le dan y se puede revocar en cualquier momento."
        actions={<Button onClick={toggleForm}>{showForm ? 'Cancelar' : 'Registrar sistema'}</Button>}
      />
      {credentials ? <NewSystemCredentials created={credentials} onDone={() => setCredentials(null)} /> : null}
      {showForm ? (
        <Card className="mb-8">
          <SystemForm
            pending={create.isPending}
            error={create.error}
            onSubmit={(body) =>
              create.mutate(body, {
                onSuccess: (created) => {
                  setShowForm(false);
                  setCredentials(created);
                },
              })
            }
          />
        </Card>
      ) : null}
      {revoking ? (
        <ConfirmCard
          message={
            <>
              ¿Revocar <strong>{revoking.name}</strong>? Dejará de poder pedir tokens y los que ya tiene dejarán de funcionar de inmediato.
            </>
          }
          confirmLabel="Confirmar revocación"
          cancelLabel="Cancelar revocación"
          pending={revoke.isPending}
          error={revoke.error}
          onConfirm={() => revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}
          onCancel={() => setRevoking(null)}
        />
      ) : null}
      <SystemsList query={systems} onRevoke={startRevoke} />
    </>
  );
}
