import { clsx } from 'clsx';
import { type SelectHTMLAttributes, useId } from 'react';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  readonly label: string;
  readonly error?: string | undefined;
}

/** Etiqueta + lista desplegable nativa + error, con asociación ARIA correcta. */
export function Select({ label, error, className, children, ...select }: SelectProps) {
  const id = useId();
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-[var(--color-ink)]">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={clsx(
          'rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3.5 py-2.5 text-base text-[var(--color-text)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]',
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-line)]',
        )}
        {...select}
      >
        {children}
      </select>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
