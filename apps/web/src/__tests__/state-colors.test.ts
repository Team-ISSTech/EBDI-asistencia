import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ATTENDANCE_STATUSES } from '@sirai/domain';
import { describe, expect, it } from 'vitest';
import { STATUS_SELECTED_CLASSES } from '../features/attendance/status';

const tokens = readFileSync(resolve(__dirname, '../../../../packages/ui/src/styles/tokens.css'), 'utf8');

const tokenValue = (name: string): string => {
  const value = new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(tokens)?.[1];
  if (!value) throw new Error(`Sin valor hexadecimal para ${name}`);
  return value;
};

/** Luminancia relativa de WCAG 2.1. */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastWithWhite = (hex: string): number => 1.05 / (luminance(hex) + 0.05);

/** RNF-14: el estado elegido en el pase de lista se pinta con su color y texto blanco legible (≥ 4.5:1). */
describe('colores de los estados de asistencia', () => {
  it.each(ATTENDANCE_STATUSES)('%s usa su token de packages/ui con texto blanco de al menos 4.5:1', (status) => {
    const classes = STATUS_SELECTED_CLASSES[status];
    expect(classes).toContain('text-white');
    const token = /bg-\[var\((--color-[a-z-]+)\)\]/.exec(classes)?.[1] ?? '';
    expect(token).toBe(`--color-${status.toLowerCase().replaceAll('_', '-')}`);
    expect(contrastWithWhite(tokenValue(token))).toBeGreaterThanOrEqual(4.5);
  });
});
