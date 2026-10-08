import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold ' +
  'transition-[transform,background-color,opacity] duration-[var(--duration-fast)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink-soft)]',
  secondary: 'border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-ink-muted)]',
  ghost: 'text-[var(--color-ink)] hover:bg-[rgb(20_50_58/6%)]',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
};

/** Botón con cuatro variantes; `loading` desactiva y anuncia espera. */
export function Button({ variant = 'primary', loading = false, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(BASE, VARIANTS[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? 'Un momento…' : children}
    </button>
  );
}
