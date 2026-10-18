import type { RoomAdmin } from '@sirai/contracts';
import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { ApiClientError } from '../../../lib/api-client';
import { RetireConfirm } from '../retire-confirm';
import { RoomForm } from '../room-form';
import { RoomsTable } from '../rooms-table';
import { useAdminRooms, useRoomActions } from '../use-admin-rooms';

const errorText = (error: unknown): string | null => {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : 'No se pudo completar la operación.';
};

interface ListProps {
  readonly query: ReturnType<typeof useAdminRooms>;
  readonly onEdit: (room: RoomAdmin) => void;
  readonly onToggle: (room: RoomAdmin) => void;
  readonly onRetire: (room: RoomAdmin) => void;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function RoomsList({ query, onEdit, onToggle, onRetire }: ListProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando salas…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar el catálogo de salas.
      </p>
    );
  }
  if (query.data.rooms.length === 0) return <EmptyState title="Aún no hay salas" description="Crea la primera sala o grupo para poder inscribir infantes." />;
  return <RoomsTable rooms={query.data.rooms} onEdit={onEdit} onToggle={onToggle} onRetire={onRetire} />;
}

/** Catálogo de salas y grupos de la estancia (RF-32): alta, edición, desactivación y baja lógica. */
export function RoomsPage() {
  const rooms = useAdminRooms();
  const { create, update, retire } = useRoomActions();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RoomAdmin | null>(null);
  const [retiring, setRetiring] = useState<RoomAdmin | null>(null);
  const actionError = errorText(update.error) ?? errorText(retire.error);

  const toggleForm = () => {
    create.reset();
    setEditing(null);
    setShowForm((visible) => !visible);
  };
  const openEditor = (room: RoomAdmin | null) => {
    update.reset();
    setShowForm(false);
    setEditing(room);
  };
  const toggle = (room: RoomAdmin) => update.mutate({ id: room.id, body: { status: room.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO' } });
  const startRetire = (room: RoomAdmin) => {
    retire.reset();
    setRetiring(room);
  };

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Salas"
        description="Salas y grupos de tu estancia, con su turno, rango de edad y capacidad. Una sala con infantes inscritos no cambia de turno, no baja su capacidad por debajo de ellos y no se desactiva."
        actions={<Button onClick={toggleForm}>{showForm ? 'Cancelar' : 'Nueva sala'}</Button>}
      />
      {showForm ? (
        <Card className="mb-8">
          <RoomForm pending={create.isPending} error={create.error} onSubmit={(body) => create.mutate(body, { onSuccess: () => setShowForm(false) })} />
        </Card>
      ) : null}
      {editing ? (
        <Card className="mb-8">
          <RoomForm key={editing.id} room={editing} pending={update.isPending} error={update.error} onSubmit={(body) => update.mutate({ id: editing.id, body }, { onSuccess: () => openEditor(null) })} />
        </Card>
      ) : null}
      {retiring ? <RetireConfirm name={retiring.name} pending={retire.isPending} onConfirm={() => retire.mutate(retiring.id, { onSuccess: () => setRetiring(null) })} onCancel={() => setRetiring(null)} /> : null}
      {actionError ? (
        <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">
          {actionError}
        </p>
      ) : null}
      <RoomsList query={rooms} onEdit={openEditor} onToggle={toggle} onRetire={startRetire} />
    </>
  );
}
