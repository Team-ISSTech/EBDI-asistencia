import type { SessionResponse } from '@sirai/contracts';
import { Button } from '@sirai/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSessionActions } from '../../features/auth/use-session';
import { ROLE_LABELS } from '../../lib/labels';
import { type OfflineApi, useOfflineOptional } from '../../offline/offline-api';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Qué captura sigue en la tablet: lo pendiente de enviar y lo que espera revisión. */
const leftBehind = ({ pending, review }: OfflineApi['counts']): string =>
  [pending > 0 ? `${plural(pending, 'captura', 'capturas')} sin enviar` : null, review > 0 ? `${plural(review, 'captura', 'capturas')} por revisar` : null]
    .filter((part): part is string => part !== null)
    .join(' y ');

interface LeaveWarningProps {
  readonly offline: OfflineApi;
  readonly onSendAndLeave: () => void;
  readonly onLeave: () => void;
  readonly onCancel: () => void;
}

/**
 * Salir con capturas en la tablet no las pierde (RF-23): se quedan cifradas y se envían
 * cuando la misma persona vuelve a entrar. Se avisa para que nadie lo descubra después.
 */
function LeaveWarning({ offline, onSendAndLeave, onLeave, onCancel }: LeaveWarningProps) {
  const canSend = offline.online && offline.counts.pending > 0;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-white/10 p-3 text-xs">
      <p>
        Tienes {leftBehind(offline.counts)}. Se conservan cifradas en esta tablet y se enviarán cuando vuelvas a iniciar sesión con tu cuenta.
      </p>
      {!offline.online && offline.counts.pending > 0 ? <p>Sin conexión no se pueden enviar ahora.</p> : null}
      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onSendAndLeave}>
            Enviar ahora y salir
          </Button>
        ) : null}
        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onLeave}>
          Cerrar sesión de todos modos
        </Button>
        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Persona, sus roles y el cierre de sesión, al pie de la barra lateral. */
export function ShellFooter({ session }: { readonly session: SessionResponse }) {
  const { logout } = useSessionActions();
  const navigate = useNavigate();
  const offline = useOfflineOptional();
  const [confirming, setConfirming] = useState(false);
  const roles = [...new Set(session.assignments.map((a) => ROLE_LABELS[a.role]))].join(', ');
  const hasUnsent = offline !== null && offline.counts.pending + offline.counts.review > 0;

  const leave = () => logout.mutate(undefined, { onSuccess: () => navigate('/iniciar-sesion') });
  const sendAndLeave = async () => {
    await offline?.syncNow();
    leave();
  };

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-white/15 pt-4">
      <p className="truncate text-sm font-medium">{session.user.name}</p>
      <p className="truncate text-xs text-white/70">{roles}</p>
      <Link to="/cambiar-contrasena" className="text-xs text-white/70 underline-offset-4 hover:underline">
        Cambiar contraseña
      </Link>
      {confirming && offline ? (
        <LeaveWarning offline={offline} onSendAndLeave={() => void sendAndLeave()} onLeave={leave} onCancel={() => setConfirming(false)} />
      ) : (
        <Button variant="ghost" className="self-start text-white hover:bg-white/10" loading={logout.isPending} onClick={() => (hasUnsent ? setConfirming(true) : leave())}>
          Cerrar sesión
        </Button>
      )}
      {logout.isError ? (
        <p role="alert" className="text-xs text-[var(--color-accent)]">
          No se pudo cerrar la sesión. Intenta de nuevo.
        </p>
      ) : null}
    </div>
  );
}
