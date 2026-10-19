import type { EstanciaSummary, User } from '@sirai/contracts';
import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../../auth/use-session';
import { UserForm } from '../user-form';
import { UserPanel, type UserPanelState } from '../user-panel';
import { useUserActions, useUsers } from '../use-users';
import { UsersTable } from '../users-table';

interface UsersContentProps {
  readonly query: ReturnType<typeof useUsers>;
  readonly estancias: readonly EstanciaSummary[];
  readonly currentUserId: number;
  readonly onPanel: (state: UserPanelState) => void;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function UsersContent({ query, estancias, currentUserId, onPanel }: UsersContentProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando usuarios…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar la lista de usuarios.
      </p>
    );
  }
  if (query.data.users.length === 0) {
    return <EmptyState title="Aún no hay usuarios" description="Crea el primer usuario para que el equipo de la estancia pueda entrar." />;
  }
  return (
    <UsersTable
      users={query.data.users}
      estancias={estancias}
      currentUserId={currentUserId}
      onEdit={(user: User) => onPanel({ kind: 'roles', user })}
      onResetPassword={(user: User) => onPanel({ kind: 'reset', user })}
      onRetire={(user: User) => onPanel({ kind: 'retire', user })}
    />
  );
}

/** Administración de usuarios: alta, roles, restablecer contraseña y baja. */
export function UsersPage() {
  const { data: session } = useSession();
  const users = useUsers();
  const { create } = useUserActions();
  const [showForm, setShowForm] = useState(false);
  const [panel, setPanel] = useState<UserPanelState | null>(null);
  const estancias = session?.availableEstancias ?? [];

  const toggleForm = () => {
    create.reset();
    setShowForm((visible) => !visible);
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
      {panel ? <UserPanel state={panel} estancias={estancias} onClose={() => setPanel(null)} /> : null}
      <UsersContent query={users} estancias={estancias} currentUserId={session?.user.id ?? 0} onPanel={setPanel} />
    </>
  );
}
