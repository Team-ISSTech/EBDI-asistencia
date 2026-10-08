import { Button, EstanciaStamp } from '@sirai/ui';
import { Navigate, useNavigate } from 'react-router';
import { useSession, useSessionActions } from '../use-session';

/** Lista las estancias que la sesión puede activar; los roles centrales ven todas. */
export function SelectEstanciaPage() {
  const { data: session } = useSession();
  const { switchEstancia } = useSessionActions();
  const navigate = useNavigate();

  if (!session) return null;
  if (session.availableEstancias.length === 0) return <Navigate to="/app" replace />;

  const choose = (estanciaId: number) => switchEstancia.mutate(estanciaId, { onSuccess: () => navigate('/app') });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">Hola, {session.user.name}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-[length:var(--text-xl)] font-semibold text-[var(--color-ink)]">
          ¿En qué estancia trabajas hoy?
        </h1>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {session.availableEstancias.map((estancia) => (
          <li key={estancia.id}>
            <button
              type="button"
              onClick={() => choose(estancia.id)}
              disabled={switchEstancia.isPending}
              aria-current={session.activeEstancia?.id === estancia.id ? 'true' : undefined}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-left transition-transform duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] aria-[current=true]:border-[var(--color-accent)]"
            >
              <EstanciaStamp name={estancia.name} size="lg" />
            </button>
          </li>
        ))}
      </ul>
      {switchEstancia.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo cambiar de estancia. Intenta de nuevo.
        </p>
      ) : null}
      {session.activeEstancia ? (
        <Button variant="ghost" onClick={() => navigate('/app')} className="self-start">
          Seguir en {session.activeEstancia.name}
        </Button>
      ) : null}
    </main>
  );
}
