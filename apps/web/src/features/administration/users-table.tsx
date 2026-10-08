import type { EstanciaSummary, User } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';
import { ROLE_LABELS, STATUS_LABELS } from '../../lib/labels';

const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('es-MX') : 'Nunca');

interface UserRowProps {
  readonly user: User;
  readonly estanciaNames: ReadonlyMap<number, string>;
  readonly onEdit: () => void;
}

function UserRow({ user, estanciaNames, onEdit }: UserRowProps) {
  const label = (role: User['assignments'][number]['role'], estanciaId: number | null): string =>
    estanciaId === null ? ROLE_LABELS[role] : `${ROLE_LABELS[role]} · ${estanciaNames.get(estanciaId) ?? `Estancia ${estanciaId}`}`;
  return (
    <tr>
      <Td>
        <p className="font-medium text-[var(--color-ink)]">{user.name}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{user.email}</p>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {user.assignments.map((a) => (
            <Badge key={`${a.role}-${a.estanciaId}`} tone={a.estanciaId === null ? 'accent' : 'neutral'}>
              {label(a.role, a.estanciaId)}
            </Badge>
          ))}
          {user.assignments.length === 0 ? <span className="text-xs text-[var(--color-text-muted)]">Sin roles</span> : null}
        </div>
      </Td>
      <Td>
        <Badge tone={user.status === 'ACTIVO' ? 'success' : 'danger'}>{STATUS_LABELS[user.status]}</Badge>
      </Td>
      <Td className="whitespace-nowrap text-[var(--color-text-muted)]">{formatDate(user.lastAccessAt)}</Td>
      <Td className="whitespace-nowrap">
        <Button variant="ghost" onClick={onEdit}>
          Editar roles
        </Button>
      </Td>
    </tr>
  );
}

export interface UsersTableProps {
  readonly users: readonly User[];
  readonly estancias: readonly EstanciaSummary[];
  readonly onEdit: (user: User) => void;
}

export function UsersTable({ users, estancias, onEdit }: UsersTableProps) {
  const estanciaNames = new Map(estancias.map((e) => [e.id, e.name]));
  return (
    <Table>
      <thead>
        <tr>
          <Th>Persona</Th>
          <Th>Roles</Th>
          <Th>Estatus</Th>
          <Th>Último acceso</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <UserRow key={user.id} user={user} estanciaNames={estanciaNames} onEdit={() => onEdit(user)} />
        ))}
      </tbody>
    </Table>
  );
}
