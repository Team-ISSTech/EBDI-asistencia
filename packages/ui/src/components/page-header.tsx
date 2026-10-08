import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

/** Encabezado de pantalla: contexto arriba (eyebrow), título y acciones a la derecha. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{eyebrow}</p>
        ) : null}
        <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-xl)] font-semibold tracking-tight text-[var(--color-ink)]">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}
