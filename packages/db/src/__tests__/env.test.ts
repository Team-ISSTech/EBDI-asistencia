import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRootEnv, requireEnv } from '../cli/env.js';

const VAR = 'SIRAI_PRUEBA_ENV_CLI';

describe('loadRootEnv', () => {
  afterEach(() => {
    delete process.env[VAR];
  });

  it('encuentra el .env subiendo desde un subdirectorio y carga sus variables', () => {
    const root = mkdtempSync(join(tmpdir(), 'sirai-env-'));
    const nested = join(root, 'packages', 'db');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, '.env'), `${VAR}=valor-de-prueba\n`);
    try {
      expect(loadRootEnv(nested)).toBe(join(root, '.env'));
      expect(requireEnv(VAR)).toBe('valor-de-prueba');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('devuelve null sin tocar el entorno cuando no hay .env (contenedores)', () => {
    const root = mkdtempSync(join(tmpdir(), 'sirai-noenv-'));
    try {
      expect(loadRootEnv(root)).toBeNull();
      expect(() => requireEnv(VAR)).toThrow(/SIRAI_PRUEBA_ENV_CLI/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
