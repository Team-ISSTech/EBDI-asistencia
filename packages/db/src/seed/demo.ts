import { CENTRAL_ROLE_CODES, ROLE_CODES, type RoleCode } from '@sirai/auth';
import { eq, like } from 'drizzle-orm';
import type { Db } from '../client.js';
import { auditoria, children, ciclosEscolares, estancias, usuarios } from '../schema/index.js';
import { seedAttendance } from './demo-attendance.js';
import { createSeedCipher } from './demo-cipher.js';
import { DEMO_ENROLLMENT_PREFIX, createRng, planEstancia, schoolDaysBefore } from './demo-data.js';
import { ensureRooms, seedRoster, type DemoActors } from './demo-roster.js';
import { DEV_ESTANCIAS, DEV_SCHOOL_YEAR, devUserEmail, ensureAssignment } from './dev.js';

const RNG_SEED = 2026;
const JOURNEY_DAYS = 10;
const DATE_LENGTH = 10;
const SEED_USER_AGENT = 'cli:seed-demo';

export interface DemoOptions {
  /** Misma llave hexadecimal de `DATA_ENCRYPTION_KEY` que usa la API: así descifra lo que se siembra. */
  readonly encryptionKey: string;
  readonly now?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface DemoSummary {
  /** Verdadero si ya había datos de demostración y no se tocó nada. */
  readonly skipped: boolean;
  readonly children: number;
  readonly journeys: number;
  readonly records: number;
  readonly followUps: number;
}

/** Los datos de demostración incluyen menores ficticios con tutores y teléfonos: no corren en producción. */
export function assertDemoAllowed(env: Readonly<Record<string, string | undefined>>): void {
  if (env['NODE_ENV'] === 'production') throw new Error('La semilla de demostración no se ejecuta con NODE_ENV=production.');
}

const requireId = async (db: Db, email: string): Promise<number> => {
  const [row] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!row) throw new Error(`Falta el usuario ${email}: corre primero \`pnpm --filter @sirai/db seed\`.`);
  return row.id;
};

const loadActors = async (db: Db): Promise<DemoActors> => ({
  directoraId: await requireId(db, devUserEmail('DIRECTORA')),
  docenteId: await requireId(db, devUserEmail('DOCENTE')),
  trabajoSocialId: await requireId(db, devUserEmail('TRABAJO_SOCIAL')),
  medicoId: await requireId(db, devUserEmail('MEDICO')),
});

const loadEstanciaIds = async (db: Db): Promise<number[]> => {
  const rows = await db.select({ id: estancias.id, code: estancias.ebdiCode }).from(estancias);
  return DEV_ESTANCIAS.map(({ ebdiCode }) => {
    const found = rows.find((row) => row.code === ebdiCode);
    if (!found) throw new Error(`Falta la estancia ${ebdiCode}: corre primero \`pnpm --filter @sirai/db seed\`.`);
    return found.id;
  });
};

const loadSchoolYearId = async (db: Db): Promise<number> => {
  const [row] = await db.select({ id: ciclosEscolares.id }).from(ciclosEscolares).where(eq(ciclosEscolares.code, DEV_SCHOOL_YEAR.code));
  if (!row) throw new Error(`Falta el ciclo escolar ${DEV_SCHOOL_YEAR.code}: corre primero \`pnpm --filter @sirai/db seed\`.`);
  return row.id;
};

/**
 * Los usuarios de la semilla base solo pertenecen a la primera estancia. Para probar el cambio de estancia y el
 * aislamiento entre ellas, los roles de estancia reciben también la segunda (los centrales ya ven todo).
 */
const extendAssignments = async (db: Db, secondEstanciaId: number): Promise<void> => {
  for (const role of ROLE_CODES.filter((code: RoleCode) => !CENTRAL_ROLE_CODES.includes(code))) {
    await ensureAssignment(db, await requireId(db, devUserEmail(role)), role, secondEstanciaId);
  }
};

const alreadySeeded = async (db: Db): Promise<boolean> => {
  const rows = await db.select({ id: children.id }).from(children).where(like(children.enrollmentNumber, `${DEMO_ENROLLMENT_PREFIX}-%`)).limit(1);
  return rows.length > 0;
};

/**
 * Llena las dos estancias de la semilla base con infantes, tutores, consentimientos y diez días hábiles de
 * asistencia con sus seguimientos, para probar la aplicación sin teclear datos. Es repetible: si ya hay datos
 * de demostración no hace nada (las tablas con datos de menores no se borran ni se sobrescriben). Requiere
 * haber corrido antes la semilla base. Todo es inventado; los teléfonos usan un rango que no existe.
 */
export async function seedDemoData(db: Db, options: DemoOptions): Promise<DemoSummary> {
  assertDemoAllowed(options.env ?? process.env);
  const cipher = createSeedCipher(options.encryptionKey);
  const now = options.now ?? new Date();
  const [actors, estanciaIds, schoolYearId] = [await loadActors(db), await loadEstanciaIds(db), await loadSchoolYearId(db)];
  if (await alreadySeeded(db)) return { skipped: true, children: 0, journeys: 0, records: 0, followUps: 0 };
  await extendAssignments(db, estanciaIds[1] as number);
  const roomIdsByEstancia = new Map<number, number[]>();
  for (const estanciaId of estanciaIds) roomIdsByEstancia.set(estanciaId, await ensureRooms(db, estanciaId, now));

  const today = now.toISOString().slice(0, DATE_LENGTH);
  const days = schoolDaysBefore(today, JOURNEY_DAYS, DEV_SCHOOL_YEAR.startDate);
  const rng = createRng(RNG_SEED);
  let clientSerial = 0;
  const summary = { children: 0, journeys: 0, records: 0, followUps: 0 };
  await db.transaction(async (tx) => {
    let absences = 0;
    for (const [index, estanciaId] of estanciaIds.entries()) {
      const context = { estanciaId, roomIds: roomIdsByEstancia.get(estanciaId) as number[], schoolYearId, startDate: DEV_SCHOOL_YEAR.startDate, now, actors, cipher };
      const roster = await seedRoster(tx, planEstancia(index, today, rng), context);
      const result = await seedAttendance(tx, { ...context, rng, days, nextClientId: () => demoClientId((clientSerial += 1)) }, roster, absences);
      absences = result.absences;
      summary.children += roster.length;
      summary.journeys += result.journeys;
      summary.records += result.records;
      summary.followUps += result.followUps;
    }
    await tx.insert(auditoria).values({ userId: null, roleCode: 'SISTEMA', action: 'SEMILLA_DEMO', tableName: 'infantes', recordId: null, userAgent: SEED_USER_AGENT, occurredAt: now });
  });
  return { skipped: false, ...summary };
}

/** UUID v4 con forma válida y folio legible; el prefijo `de0` los distingue de los que crean los clientes. */
const demoClientId = (serial: number): string => `de000000-0000-4000-8000-${serial.toString(16).padStart(12, '0')}`;
