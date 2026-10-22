import { EstanciaStamp } from '@sirai/ui';
import { Link, Outlet } from 'react-router';
import { useSession } from '../../features/auth/use-session';
import { ConnectionBanner } from '../../offline/connection-banner';
import { ShellFooter } from './shell-footer';
import { Sidebar } from './sidebar';

/**
 * Cáscara de la aplicación: barra lateral en tinta con el sello de la
 * estancia activa, y un área de contenido en papel. En pantallas angostas
 * la barra pasa arriba.
 */
export function AppShell() {
  const { data: session } = useSession();
  if (!session) return null;

  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-[var(--radius-md)] focus:bg-[var(--color-surface)] focus:px-3 focus:py-2 focus:text-[var(--color-ink)]"
      >
        Saltar al contenido
      </a>
      <aside className="flex flex-col gap-8 bg-[var(--color-ink)] p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex flex-col gap-4">
          <Link to="/app" className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
            SIRAI
          </Link>
          {session.activeEstancia ? (
            <Link to="/seleccionar-estancia" className="text-white" aria-label={`Estancia activa: ${session.activeEstancia.name}. Cambiar`}>
              <EstanciaStamp name={session.activeEstancia.name} />
            </Link>
          ) : (
            <Link to="/seleccionar-estancia" className="text-sm text-white/75 underline-offset-4 hover:underline">
              Sin estancia activa
            </Link>
          )}
        </div>
        <Sidebar permissions={session.permissions} />
        <ShellFooter session={session} />
      </aside>
      <main id="contenido" tabIndex={-1} className="px-6 py-8 outline-none lg:px-12 lg:py-10">
        <ConnectionBanner />
        <Outlet />
      </main>
    </div>
  );
}
