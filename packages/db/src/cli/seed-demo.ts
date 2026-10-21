import { connect } from '../client.js';
import { seedDemoData } from '../seed/demo.js';
import { loadRootEnv, requireEnv } from './env.js';

loadRootEnv();
// La guardia de producción vive en seedDemoData (assertDemoAllowed).
const connection = connect(requireEnv('DATABASE_URL'));
try {
  const summary = await seedDemoData(connection.db, { encryptionKey: requireEnv('DATA_ENCRYPTION_KEY') });
  process.stdout.write(
    summary.skipped
      ? 'Ya hay datos de demostración (matrículas DEMO-*): no se cambió nada.\n'
      : `Demo lista: ${summary.children} infantes, ${summary.journeys} jornadas, ${summary.records} asistencias, ${summary.followUps} seguimientos.\n`,
  );
} finally {
  await connection.close();
}
