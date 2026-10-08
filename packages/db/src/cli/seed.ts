import { connect } from '../client.js';
import { syncRolePermissions } from '../seed/catalog.js';
import { seedDevelopmentData } from '../seed/dev.js';
import { loadRootEnv, requireEnv } from './env.js';

loadRootEnv();
// La guardia de producción vive en seedDevelopmentData (assertSeedAllowed).
const connection = connect(requireEnv('DATABASE_URL'));
try {
  const catalog = await syncRolePermissions(connection.db);
  const dev = await seedDevelopmentData(connection.db, requireEnv('SEED_PASSWORD'));
  process.stdout.write(
    `rol_permiso: +${catalog.inserted} -${catalog.removed}. Usuarios: ${dev.users.join(', ')}\n`,
  );
} finally {
  await connection.close();
}
