import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}

/** Una pantalla vacía es una invitación a actuar: dice qué falta y qué hacer. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line)] px-6 py-16 text-center">
      <span aria-hidden="true" className="h-2 w-10 rounded-full bg-[var(--color-accent)]" />
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
      <p className="max-w-md text-sm text-[var(--color-text-muted)]">{description}</p>
      {action}
    </div>
  );
}
