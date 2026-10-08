import { resolve } from 'node:path';
import { applyMigrations } from '../migrate/runner.js';
import { loadRootEnv, requireEnv } from './env.js';

loadRootEnv();
const report = await applyMigrations(requireEnv('DATABASE_URL'), resolve(import.meta.dirname, '../../sql'));
process.stdout.write(
  `Migraciones aplicadas: ${report.applied.join(', ') || 'ninguna'}; ya presentes: ${report.skipped.length}\n`,
);
