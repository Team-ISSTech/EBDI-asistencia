import { Button } from '@sirai/ui';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LoadingScreen } from '../../app/pages/loading-screen';
import { CHANGE_PASSWORD_PATH } from './post-login-path';
import { useSession } from './use-session';

/** Protege un subárbol: sin sesión redirige a iniciar sesión recordando el destino. */
export function RequireSession({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <LoadingScreen />;
  if (session.isError) {
    return (
      <main className="grid min-h-screen place-content-center gap-3 text-center">
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo comprobar tu sesión. Revisa la conexión e intenta de nuevo.
        </p>
        <Button variant="secondary" onClick={() => void session.refetch()}>
          Reintentar
        </Button>
      </main>
    );
  }
  if (!session.data) return <Navigate to="/iniciar-sesion" replace state={{ from: location.pathname }} />;
  // Con una contraseña temporal solo se puede cambiarla: la API lo exige y la pantalla no ofrece nada más.
  if (session.data.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  return children;
}
