import type { EstanciaAdmin } from '@sirai/contracts';
import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { ApiClientError } from '../../../lib/api-client';
import { EstanciaForm } from '../estancia-form';
import { EstanciasTable } from '../estancias-table';
import { RetireConfirm } from '../retire-confirm';
import { useEstanciaActions, useEstancias } from '../use-estancias';

const errorText = (error: unknown): string | null => {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : 'No se pudo completar la operación.';
};

interface ListProps {
  readonly query: ReturnType<typeof useEstancias>;
  readonly onEdit: (estancia: EstanciaAdmin) => void;
  readonly onToggle: (estancia: EstanciaAdmin) => void;
  readonly onRetire: (estancia: EstanciaAdmin) => void;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function EstanciasList({ query, onEdit, onToggle, onRetire }: ListProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando estancias…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar el catálogo de estancias.
      </p>
    );
  }
  if (query.data.estancias.length === 0) return <EmptyState title="Aún no hay estancias" description="Crea la primera estancia para poder asignarle personal y salas." />;
  return <EstanciasTable estancias={query.data.estancias} onEdit={onEdit} onToggle={onToggle} onRetire={onRetire} />;
}

/** Catálogo de estancias (RF-31) del administrador central: alta, edición, desactivación y baja lógica. */
export function EstanciasPage() {
  const estancias = useEstancias();
  const { create, update, retire } = useEstanciaActions();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EstanciaAdmin | null>(null);
  const [retiring, setRetiring] = useState<EstanciaAdmin | null>(null);
  const actionError = errorText(update.error) ?? errorText(retire.error);

  const toggleForm = () => {
    create.reset();
    setEditing(null);
    setShowForm((visible) => !visible);
  };
  const openEditor = (estancia: EstanciaAdmin | null) => {
    update.reset();
    setShowForm(false);
    setEditing(estancia);
  };
  const toggle = (estancia: EstanciaAdmin) => update.mutate({ id: estancia.id, body: { status: estancia.status === 'ACTIVA' ? 'INACTIVA' : 'ACTIVA' } });
  const startRetire = (estancia: EstanciaAdmin) => {
    retire.reset();
    setRetiring(estancia);
  };

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Estancias"
        description="Catálogo de estancias con su clave EBDI, región y zona horaria. Una estancia con infantes inscritos o jornadas abiertas no se desactiva ni se da de baja."
        actions={<Button onClick={toggleForm}>{showForm ? 'Cancelar' : 'Nueva estancia'}</Button>}
      />
      {showForm ? (
        <Card className="mb-8">
          <EstanciaForm pending={create.isPending} error={create.error} onCreate={(body) => create.mutate(body, { onSuccess: () => setShowForm(false) })} onUpdate={() => undefined} />
        </Card>
      ) : null}
      {editing ? (
        <Card className="mb-8">
          <EstanciaForm
            key={editing.id}
            estancia={editing}
            pending={update.isPending}
            error={update.error}
            onCreate={() => undefined}
            onUpdate={(body) => update.mutate({ id: editing.id, body }, { onSuccess: () => openEditor(null) })}
          />
        </Card>
      ) : null}
      {retiring ? (
        <RetireConfirm name={retiring.name} pending={retire.isPending} onConfirm={() => retire.mutate(retiring.id, { onSuccess: () => setRetiring(null) })} onCancel={() => setRetiring(null)} />
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">
          {actionError}
        </p>
      ) : null}
      <EstanciasList query={estancias} onEdit={openEditor} onToggle={toggle} onRetire={startRetire} />
    </>
  );
}
