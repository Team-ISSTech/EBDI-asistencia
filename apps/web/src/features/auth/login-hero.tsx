const ESTANCIAS_COUNT = 212;

/** Panel en tinta con la tesis del producto: el pase de lista de cada mañana. */
export function LoginHero() {
  return (
    <section className="flex flex-col justify-between bg-[var(--color-ink)] p-8 text-white lg:p-14">
      <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">SIRAI</p>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-display)] font-bold leading-[1.05] tracking-tight">
          El pase de lista
          <br />
          de cada mañana,
          <br />
          <span className="text-[var(--color-accent)]">en menos de tres clics.</span>
        </h1>
        <p className="mt-6 max-w-md text-base text-white/80">
          Registro de asistencia, seguimiento de ausencias y tableros para las {ESTANCIAS_COUNT} Estancias de Bienestar y
          Desarrollo Infantil.
        </p>
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-white/60">Sistema Institucional de Registro Rápido de Asistencia Infantil</p>
    </section>
  );
}
