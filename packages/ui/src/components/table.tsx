import { clsx } from 'clsx';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

/** Tabla de datos: cabecera fija en tinta suave, filas con separación fina. */
export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)]">
      <table className={clsx('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={clsx(
        'bg-[var(--color-paper)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx('border-t border-[var(--color-line)] px-4 py-3 align-top', className)} {...rest} />;
}
