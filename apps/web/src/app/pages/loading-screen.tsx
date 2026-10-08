/** Pantalla de espera mínima mientras se resuelve la sesión. */
export function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-content-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-text-muted)]">Cargando…</p>
    </main>
  );
}
