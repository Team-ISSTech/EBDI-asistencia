import type { SessionResponse } from '@sirai/contracts';
import { Button } from '@sirai/ui';
import { useNavigate } from 'react-router';
import { useSessionActions } from '../../features/auth/use-session';
import { ROLE_LABELS } from '../../lib/labels';

/** Persona, sus roles y el cierre de sesión, al pie de la barra lateral. */
export function ShellFooter({ session }: { readonly session: SessionResponse }) {
  const { logout } = useSessionActions();
  const navigate = useNavigate();
  const roles = [...new Set(session.assignments.map((a) => ROLE_LABELS[a.role]))].join(', ');
  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-white/15 pt-4">
      <p className="truncate text-sm font-medium">{session.user.name}</p>
      <p className="truncate text-xs text-white/70">{roles}</p>
      <Button
        variant="ghost"
        className="self-start text-white hover:bg-white/10"
        loading={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/iniciar-sesion') })}
      >
        Cerrar sesión
      </Button>
      {logout.isError ? (
        <p role="alert" className="text-xs text-[var(--color-accent)]">
          No se pudo cerrar la sesión. Intenta de nuevo.
        </p>
      ) : null}
    </div>
  );
}
