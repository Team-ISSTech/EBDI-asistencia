import type { DashboardTotals } from '@sirai/contracts';
import { Badge, Card } from '@sirai/ui';
import { TRAFFIC_LIGHTS } from '@sirai/domain';
import { LIGHT_LABELS, LIGHT_TONES, formatRate } from './lights';

export interface DashboardSummaryProps {
  readonly totals: DashboardTotals;
}

/** Asistencia global y cuántas estancias hay en cada color. */
export function DashboardSummary({ totals }: DashboardSummaryProps) {
  return (
    <section aria-label="Resumen" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Asistencia global</p>
        <p className="text-3xl font-semibold text-[var(--color-ink)]">{formatRate(totals.rate)}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {totals.present} de {totals.enrolled} inscritos presentes
        </p>
      </Card>
      {TRAFFIC_LIGHTS.map((light) => (
        <Card key={light}>
          <Badge tone={LIGHT_TONES[light]}>{LIGHT_LABELS[light]}</Badge>
          <p className="mt-1 text-3xl font-semibold text-[var(--color-ink)]">{totals.lights[light]}</p>
          <p className="text-xs text-[var(--color-text-muted)]">estancias</p>
        </Card>
      ))}
    </section>
  );
}
