import { clsx } from 'clsx';
import { type TextareaHTMLAttributes, useId } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string;
}

/** Etiqueta + área de texto + ayuda o error, con asociación ARIA correcta. */
export function Textarea({ label, error, hint, className, ...area }: TextareaProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-[var(--color-ink)]">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3.5 py-2.5 text-base text-[var(--color-text)]',
          'placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]',
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-line)]',
        )}
        {...area}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
