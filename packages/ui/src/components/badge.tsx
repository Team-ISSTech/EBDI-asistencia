import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'danger' | 'success';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[rgb(20_50_58/8%)] text-[var(--color-ink)]',
  accent: 'bg-[rgb(229_169_43/18%)] text-[var(--color-accent-text)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  success: 'bg-[rgb(47_143_91/14%)] text-[var(--color-success-text)]',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide', TONES[tone], className)}
      {...rest}
    />
  );
}
