import { clsx } from 'clsx';

export interface EstanciaStampProps {
  readonly name: string;
  readonly code?: string | undefined;
  readonly size?: 'sm' | 'lg';
}

/**
 * Sello de estancia: el elemento distintivo de SIRAI. Cada estancia se
 * identifica con un sello en tinta, como el que marca el pase de lista en
 * papel. Se usa en el selector y en la cabecera de la aplicación.
 */
export function EstanciaStamp({ name, code, size = 'sm' }: EstanciaStampProps) {
  return (
    <span
      className={clsx(
        'inline-flex flex-col rounded-[var(--radius-stamp)] border-2 border-[var(--color-accent)] px-3 py-1.5 leading-tight',
        size === 'lg' ? 'min-w-56 px-4 py-3' : 'min-w-40',
      )}
    >
      {code ? (
        <span className="font-[family-name:var(--font-display)] text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
          {code}
        </span>
      ) : null}
      <span className={clsx('font-[family-name:var(--font-display)] font-semibold', size === 'lg' ? 'text-lg' : 'text-sm')}>
        {name}
      </span>
    </span>
  );
}
