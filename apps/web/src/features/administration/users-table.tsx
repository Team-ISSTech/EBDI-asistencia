import type { EstanciaSummary, User } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';
import { ROLE_LABELS, STATUS_LABELS } from '../../lib/labels';

const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('es-MX') : 'Nunca');

interface UserRowProps {
  readonly user: User;
  readonly estanciaNames: ReadonlyMap<number, string>;
  readonly onEdit: () => void;
  readonly onResetPassword: () => void;
  /** Ausente en la fila de quien tiene la sesión: nadie se da de baja a sí mismo. */
  readonly onRetire?: () => void;
}

function UserRow({ user, estanciaNames, onEdit, onResetPassword, onRetire }: UserRowProps) {
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
        <Button variant="ghost" aria-label={`Restablecer contraseña de ${user.name}`} onClick={onResetPassword}>
          Restablecer contraseña
        </Button>
        {onRetire ? (
          <Button variant="ghost" aria-label={`Dar de baja a ${user.name}`} onClick={onRetire}>
            Dar de baja
          </Button>
        ) : null}
      </Td>
    </tr>
  );
}

export interface UsersTableProps {
  readonly users: readonly User[];
  readonly estancias: readonly EstanciaSummary[];
  readonly onEdit: (user: User) => void;
  readonly onResetPassword: (user: User) => void;
  readonly onRetire: (user: User) => void;
  /** Quien tiene la sesión; no se le ofrece darse de baja. */
  readonly currentUserId: number;
}

export function UsersTable({ users, estancias, onEdit, onResetPassword, onRetire, currentUserId }: UsersTableProps) {
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
          <UserRow key={user.id} user={user} estanciaNames={estanciaNames} onEdit={() => onEdit(user)} onResetPassword={() => onResetPassword(user)} {...(user.id === currentUserId ? {} : { onRetire: () => onRetire(user) })} />
        ))}
      </tbody>
    </Table>
  );
}
