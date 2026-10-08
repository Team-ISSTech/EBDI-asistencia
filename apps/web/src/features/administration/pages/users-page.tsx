import type { EstanciaSummary, User, UserListResponse } from '@sirai/contracts';
import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../../auth/use-session';
import { RolesEditorCard } from '../roles-editor-card';
import { UserForm } from '../user-form';
import { useUserActions, useUsers } from '../use-users';
import { UsersTable } from '../users-table';

interface UsersListProps {
  readonly data: UserListResponse;
  readonly estancias: readonly EstanciaSummary[];
  readonly onEdit: (user: User) => void;
}

function UsersList({ data, estancias, onEdit }: UsersListProps) {
  if (data.users.length === 0) {
    return <EmptyState title="Aún no hay usuarios" description="Crea el primer usuario para que el equipo de la estancia pueda entrar." />;
  }
  return <UsersTable users={data.users} estancias={estancias} onEdit={onEdit} />;
}

/** Administración de usuarios: alta y asignación de roles por estancia. */
export function UsersPage() {
  const { data: session } = useSession();
  const users = useUsers();
  const { create, replaceRoles } = useUserActions();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const estancias = session?.availableEstancias ?? [];

  const toggleForm = () => {
    create.reset();
    setShowForm((visible) => !visible);
  };
  /** Cada editor empieza sin el error de la edición anterior. */
  const openEditor = (user: User | null) => {
    replaceRoles.reset();
    setEditing(user);
  };

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios"
        description="Personas con acceso al sistema y los roles que ejercen en cada estancia."
        actions={<Button onClick={toggleForm}>{showForm ? 'Cancelar' : 'Nuevo usuario'}</Button>}
      />
      {showForm ? (
        <Card className="mb-8">
          <UserForm
            estancias={estancias}
            pending={create.isPending}
            error={create.error}
            onSubmit={(body) => create.mutate(body, { onSuccess: () => setShowForm(false) })}
          />
        </Card>
      ) : null}
      {editing ? (
        <RolesEditorCard
          key={editing.id}
          user={editing}
          estancias={estancias}
          pending={replaceRoles.isPending}
          error={replaceRoles.isError}
          onSave={(assignments) => replaceRoles.mutate({ userId: editing.id, body: { assignments } }, { onSuccess: () => openEditor(null) })}
          onCancel={() => openEditor(null)}
        />
      ) : null}
      {users.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Cargando usuarios…</p> : null}
      {users.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo cargar la lista de usuarios.
        </p>
      ) : null}
      {users.data ? <UsersList data={users.data} estancias={estancias} onEdit={openEditor} /> : null}
    </>
  );
}
