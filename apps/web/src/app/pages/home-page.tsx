import { Navigate } from 'react-router';
import { useSession } from '../../features/auth/use-session';
import { landingPathFor } from '../nav-items';
import { ForbiddenPage } from './forbidden-page';

/** `/app` manda a la primera pantalla que la sesión puede usar. */
export function HomePage() {
  const { data: session } = useSession();
  if (!session) return null;
  const path = landingPathFor(session.permissions);
  return path ? <Navigate to={path} replace /> : <ForbiddenPage />;
}
