import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });

/** Un borrado físico de la base: `db.delete(...)`, `tx.delete(...)` o SQL `DELETE FROM`. */
export const physicalDeletes = (code: string): string[] =>
  code.split('\n').filter((line) => /\b(?:db|tx|executor)\.delete\(|DELETE\s+FROM/i.test(line));

describe('borrado lógico, nunca DELETE (RNF-04)', () => {
  it('detecta un borrado físico en el código', () => {
    expect(physicalDeletes('await tx.delete(children).where(x);')).toHaveLength(1);
    expect(physicalDeletes('await this.db.delete(guardians);')).toHaveLength(1);
    expect(physicalDeletes("sql`DELETE FROM tutores WHERE id = 1`")).toHaveLength(1);
    expect(physicalDeletes('this.windows.delete(id);')).toHaveLength(0);
    expect(physicalDeletes('await tx.update(children).set({ deletedAt: now });')).toHaveLength(0);
  });

  it('ningún archivo de producción de la API borra filas de la base', () => {
    const offenders = sourceFiles(SRC).flatMap((file) => physicalDeletes(readFileSync(file, 'utf8')).map((line) => `${file}: ${line.trim()}`));
    expect(offenders).toEqual([]);
  });
});
