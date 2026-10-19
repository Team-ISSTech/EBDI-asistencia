import type { EstanciaSummary, User } from '@sirai/contracts';
import { ConfirmCard } from '../../components/confirm-card';
import { ResetPasswordCard } from './reset-password-card';
import { RolesEditorCard } from './roles-editor-card';
import { useUserActions } from './use-users';

/** Qué se está haciendo con un usuario de la lista; solo una cosa a la vez. */
export interface UserPanelState {
  readonly kind: 'roles' | 'reset' | 'retire';
  readonly user: User;
}

export interface UserPanelProps {
  readonly state: UserPanelState;
  readonly estancias: readonly EstanciaSummary[];
  readonly onClose: () => void;
}

function RolesPanel({ user, estancias, onClose }: { readonly user: User; readonly estancias: readonly EstanciaSummary[]; readonly onClose: () => void }) {
  const { replaceRoles } = useUserActions();
  return (
    <RolesEditorCard
      user={user}
      estancias={estancias}
      pending={replaceRoles.isPending}
      error={replaceRoles.isError}
      onSave={(assignments) => replaceRoles.mutate({ userId: user.id, body: { assignments } }, { onSuccess: onClose })}
      onCancel={onClose}
    />
  );
}

function RetirePanel({ user, onClose }: { readonly user: User; readonly onClose: () => void }) {
  const { retire } = useUserActions();
  return (
    <ConfirmCard
      message={
        <>
          ¿Dar de baja a <strong>{user.name}</strong>? Dejará de poder entrar y sus sesiones se cerrarán. Su historial se conserva, pero su correo no podrá usarse en una cuenta nueva.
        </>
      }
      confirmLabel="Confirmar baja"
      cancelLabel="Cancelar baja"
      pending={retire.isPending}
      error={retire.error}
      onConfirm={() => retire.mutate(user.id, { onSuccess: onClose })}
      onCancel={onClose}
    />
  );
}

/** Cada panel lleva sus propias mutaciones: al abrir otro, el error del anterior no se arrastra. */
export function UserPanel({ state, estancias, onClose }: UserPanelProps) {
  const key = `${state.kind}-${state.user.id}`;
  if (state.kind === 'roles') return <RolesPanel key={key} user={state.user} estancias={estancias} onClose={onClose} />;
  if (state.kind === 'reset') return <ResetPasswordCard key={key} user={state.user} onClose={onClose} />;
  return <RetirePanel key={key} user={state.user} onClose={onClose} />;
}
