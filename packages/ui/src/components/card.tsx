import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

/** Superficie elevada sobre el papel; agrupa contenido relacionado. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]',
        className,
      )}
      {...rest}
    />
  );
}
