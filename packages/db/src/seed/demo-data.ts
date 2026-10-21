import { applyContact, type AttendanceStatus, type ContactResult, type FollowUpCause, type FollowUpState, type FollowUpStatus } from '@sirai/domain';
import { DEV_ROOMS } from './dev.js';

/**
 * Plan de los datos de demostración. Todo es inventado y determinista: la misma semilla produce los mismos
 * infantes, tutores y casos, para que dos personas probando vean lo mismo. Este archivo no toca la base.
 */
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

const UINT32 = 4_294_967_296;

/** mulberry32: suficiente para variar nombres y estados; no es criptográfico ni pretende serlo. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    chance: (probability) => next() < probability,
  };
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const SATURDAY = 6;
const SUNDAY = 0;

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);
const fromIsoDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** Días hábiles anteriores a `today`, del más reciente al más antiguo, sin bajar de `notBefore`. */
export function schoolDaysBefore(today: string, count: number, notBefore: string): string[] {
  const days: string[] = [];
  let cursor = fromIsoDate(today).getTime() - MS_PER_DAY;
  while (days.length < count && toIsoDate(new Date(cursor)) >= notBefore) {
    const date = new Date(cursor);
    if (date.getUTCDay() !== SATURDAY && date.getUTCDay() !== SUNDAY) days.push(toIsoDate(date));
    cursor -= MS_PER_DAY;
  }
  return days;
}

const MAX_DAY_OF_MONTH = 28;

/** Fecha de nacimiento que da `ageMonths` cumplidos a `today` (más hasta 20 días, que no alcanzan para otro mes). */
export function birthDateFor(today: string, ageMonths: number, extraDays: number): string {
  const base = fromIsoDate(today);
  const born = Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - ageMonths, Math.min(base.getUTCDate(), MAX_DAY_OF_MONTH));
  return toIsoDate(new Date(born - extraDays * MS_PER_DAY));
}

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY);

/** Sala vespertina de la semilla: permite probar que las jornadas son por turno. */
export const DEMO_EXTRA_ROOM = { name: 'Maternal vespertino (prueba)', shift: 'VESPERTINO', minAgeMonths: 19, maxAgeMonths: 48, capacity: 15 } as const;

interface RoomPlan {
  readonly room: { readonly name: string; readonly shift: string; readonly minAgeMonths: number; readonly maxAgeMonths: number; readonly capacity: number };
  readonly children: number;
  /** Edad en meses con margen respecto a los límites de la sala. */
  readonly ageMonths: readonly [number, number];
}

const [LACTANTES_ROOM, MATERNAL_ROOM] = DEV_ROOMS;

export const DEMO_ROOM_PLANS: readonly RoomPlan[] = [
  { room: LACTANTES_ROOM, children: 6, ageMonths: [4, 16] },
  { room: MATERNAL_ROOM, children: 12, ageMonths: [21, 45] },
  { room: DEMO_EXTRA_ROOM, children: 8, ageMonths: [21, 45] },
];

export const DEMO_ENROLLMENT_PREFIX = 'DEMO';

const FEMALE_NAMES = ['Valentina', 'Sofía', 'Camila', 'Regina', 'Ximena', 'Renata', 'Mía', 'Emilia', 'Fernanda', 'Luciana', 'Aitana', 'Julieta', 'Mariana', 'Isabella'] as const;
const MALE_NAMES = ['Santiago', 'Mateo', 'Sebastián', 'Emiliano', 'Leonardo', 'Diego', 'Daniel', 'Ángel', 'Iker', 'Thiago', 'Lucas', 'Adrián', 'Gael', 'Bruno'] as const;
const SURNAMES = ['García', 'Hernández', 'López', 'Martínez', 'González', 'Rodríguez', 'Pérez', 'Sánchez', 'Ramírez', 'Flores', 'Torres', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Vargas', 'Castillo', 'Jiménez', 'Mendoza', 'Ruiz', 'Aguilar', 'Herrera'] as const;
const ADULT_FEMALE_NAMES = ['María', 'Guadalupe', 'Verónica', 'Patricia', 'Laura', 'Claudia', 'Alejandra', 'Gabriela', 'Rosa', 'Karla', 'Diana', 'Lucía'] as const;
const ADULT_MALE_NAMES = ['José', 'Luis', 'Carlos', 'Miguel', 'Jorge', 'Javier', 'Ricardo', 'Fernando', 'Alberto', 'Raúl', 'Héctor', 'Óscar'] as const;
const DISABILITY_GROUPS = ['Motriz', 'Visual', 'Auditiva', 'Intelectual', 'Del lenguaje'] as const;

export type ConsentProfile = 'COMPLETO' | 'SOLO_DATOS' | 'PENDIENTE' | 'RECHAZADO' | 'REVOCADO';

/** Reparte los cinco estados de consentimiento que el sistema distingue entre los infantes. */
const CONSENT_CYCLE: readonly ConsentProfile[] = ['COMPLETO', 'COMPLETO', 'SOLO_DATOS', 'COMPLETO', 'PENDIENTE', 'COMPLETO', 'COMPLETO', 'REVOCADO', 'COMPLETO', 'RECHAZADO', 'COMPLETO', 'SOLO_DATOS'];
const DISABILITY_EVERY = 9;
const DISABILITY_REMAINDER = 5;
const FAMILY_WITHOUT_PHONE = 3;
const SIBLINGS_PER_ESTANCIA = 2;

export interface GuardianPlan {
  readonly name: string;
  readonly paternalSurname: string;
  readonly maternalSurname: string | null;
  readonly relationship: string;
  /** Diez dígitos; nulo para probar el aviso a un contacto sin teléfono. */
  readonly phone: string | null;
  readonly email: string | null;
  readonly isPrimary: boolean;
  readonly canPickUp: boolean;
  readonly isEmergencyContact: boolean;
}

export interface FamilyPlan {
  readonly key: string;
  readonly paternalSurname: string;
  readonly maternalSurname: string;
  readonly guardians: readonly GuardianPlan[];
}

export interface ChildPlan {
  readonly enrollmentNumber: string;
  readonly name: string;
  readonly paternalSurname: string;
  readonly maternalSurname: string;
  readonly gender: 'Femenino' | 'Masculino';
  readonly birthDate: string;
  readonly disabilityGroup: string | null;
  readonly roomIndex: number;
  readonly familyKey: string;
  readonly consent: ConsentProfile;
}

export interface EstanciaPlan {
  readonly families: readonly FamilyPlan[];
  readonly children: readonly ChildPlan[];
}

/**
 * Teléfonos ficticios `5500` + estancia + folio: ninguna lada mexicana empieza con 00, así que no pueden ser
 * de una persona real, y son únicos entre estancias (el hash ciego los usa para buscar tutores).
 */
const demoPhone = (estanciaIndex: number, serial: number): string => `5500${estanciaIndex + 1}${pad(serial, 5)}`;

interface FamilyContext {
  readonly rng: Rng;
  readonly estanciaIndex: number;
  /** Folio siguiente de teléfono; se comparte entre familias para no repetir. */
  nextSerial: () => number;
}

const buildFamily = (context: FamilyContext, key: string, withoutPhone: boolean): FamilyPlan => {
  const { rng } = context;
  const paternalSurname = rng.pick(SURNAMES);
  const maternalSurname = rng.pick(SURNAMES);
  const phone = (): string => demoPhone(context.estanciaIndex, context.nextSerial());
  const mother: GuardianPlan = { name: rng.pick(ADULT_FEMALE_NAMES), paternalSurname: maternalSurname, maternalSurname: rng.pick(SURNAMES), relationship: 'Madre', phone: withoutPhone ? null : phone(), email: rng.chance(0.5) ? `tutor${key.toLowerCase()}@ejemplo.test` : null, isPrimary: true, canPickUp: true, isEmergencyContact: true };
  const guardians = [mother];
  if (!withoutPhone && rng.chance(0.6)) {
    guardians.push({ name: rng.pick(ADULT_MALE_NAMES), paternalSurname, maternalSurname: rng.pick(SURNAMES), relationship: 'Padre', phone: phone(), email: null, isPrimary: false, canPickUp: true, isEmergencyContact: false });
  }
  if (!withoutPhone && rng.chance(0.25)) {
    guardians.push({ name: rng.pick(ADULT_FEMALE_NAMES), paternalSurname, maternalSurname: rng.pick(SURNAMES), relationship: 'Abuela', phone: phone(), email: null, isPrimary: false, canPickUp: false, isEmergencyContact: true });
  }
  return { key, paternalSurname, maternalSurname, guardians };
};

const buildChild = (rng: Rng, today: string, plan: RoomPlan, input: { estanciaIndex: number; serial: number; roomIndex: number; family: FamilyPlan }): ChildPlan => {
  const female = rng.chance(0.5);
  const hasDisability = input.serial % DISABILITY_EVERY === DISABILITY_REMAINDER;
  return {
    enrollmentNumber: `${DEMO_ENROLLMENT_PREFIX}-${pad(input.estanciaIndex + 1, 2)}-${pad(input.serial, 3)}`,
    name: rng.pick(female ? FEMALE_NAMES : MALE_NAMES),
    paternalSurname: input.family.paternalSurname,
    maternalSurname: input.family.maternalSurname,
    gender: female ? 'Femenino' : 'Masculino',
    birthDate: birthDateFor(today, rng.int(plan.ageMonths[0], plan.ageMonths[1]), rng.int(0, 20)),
    disabilityGroup: hasDisability ? rng.pick(DISABILITY_GROUPS) : null,
    roomIndex: input.roomIndex,
    familyKey: input.family.key,
    consent: CONSENT_CYCLE[(input.serial - 1) % CONSENT_CYCLE.length] as ConsentProfile,
  };
};

/**
 * Infantes y familias de una estancia. Los primeros infantes de la sala de maternal son hermanos de los
 * primeros de lactantes: comparten tutores, que es el caso donde un teléfono se repite entre infantes.
 */
export function planEstancia(estanciaIndex: number, today: string, rng: Rng): EstanciaPlan {
  const families: FamilyPlan[] = [];
  const children: ChildPlan[] = [];
  let phoneSerial = 0;
  const context: FamilyContext = { rng, estanciaIndex, nextSerial: () => (phoneSerial += 1) };
  for (const [roomIndex, plan] of DEMO_ROOM_PLANS.entries()) {
    for (let position = 0; position < plan.children; position += 1) {
      const serial = children.length + 1;
      const sibling = roomIndex === 1 && position < SIBLINGS_PER_ESTANCIA ? families[position] : undefined;
      const family = sibling ?? buildFamily(context, `${pad(estanciaIndex + 1, 2)}${pad(serial, 3)}`, families.length === FAMILY_WITHOUT_PHONE);
      if (!sibling) families.push(family);
      children.push(buildChild(rng, today, plan, { estanciaIndex, serial, roomIndex, family }));
    }
  }
  return { families, children };
}

const ATTENDANCE_DISTRIBUTION: readonly (readonly [AttendanceStatus, number])[] = [
  ['PRESENTE', 0.82],
  ['AUSENTE_JUSTIFICADO', 0.06],
  ['FALTA_INJUSTIFICADA', 0.07],
  ['COMISION_MEDICA', 0.03],
  ['FILTRO_SANITARIO', 0.02],
];

/** Estado de un infante en un día; las ausencias son las únicas que generan seguimiento (S-08). */
export function attendanceStatusFor(rng: Rng): AttendanceStatus {
  const roll = rng.next();
  let cumulative = 0;
  for (const [status, share] of ATTENDANCE_DISTRIBUTION) {
    cumulative += share;
    if (roll < cumulative) return status;
  }
  return 'PRESENTE';
}

export interface PlannedContact {
  readonly attemptNumber: number;
  readonly occurredAt: Date;
  readonly result: ContactResult;
  readonly nextAttemptAt: Date | null;
  readonly notes: string | null;
}

export interface FollowUpScenario {
  readonly status: FollowUpStatus;
  readonly cause: FollowUpCause | null;
  readonly requiresMedicalRelease: boolean;
  readonly expectedReturnDate: string | null;
  readonly contacts: readonly PlannedContact[];
  /** El médico ya dio el alta. */
  readonly release: boolean;
  readonly closedAt: Date | null;
}

interface ContactStep {
  readonly result: ContactResult;
  readonly cause?: FollowUpCause;
  readonly returnInDays?: number;
  /** Horas después del contacto anterior (o de la ausencia, si es el primero). */
  readonly afterHours: number;
  readonly notes?: string;
}

interface ScenarioSpec {
  readonly steps: readonly ContactStep[];
  /** Días después de la ausencia en que se cierra el caso; nulo si queda abierto. */
  readonly closeAfterDays: number | null;
}

const FIRST_CALL_HOURS = 1;

/** Un caso de cada situación que la aplicación distingue; se reparten en orden entre las ausencias. */
const SCENARIOS: readonly ScenarioSpec[] = [
  { steps: [{ result: 'CONTACTADO', cause: 'ENF_CASA', returnInDays: 3, afterHours: FIRST_CALL_HOURS, notes: 'Dato de prueba: cuadro gripal, acudirá al médico.' }], closeAfterDays: null },
  { steps: [{ result: 'CONTACTADO', cause: 'PER_TUT', returnInDays: 1, afterHours: FIRST_CALL_HOURS, notes: 'Dato de prueba: permiso por viaje familiar.' }], closeAfterDays: null },
  { steps: [{ result: 'SIN_RESPUESTA', afterHours: FIRST_CALL_HOURS }], closeAfterDays: null },
  { steps: [{ result: 'SIN_RESPUESTA', afterHours: FIRST_CALL_HOURS }, { result: 'SIN_RESPUESTA', afterHours: 4 }], closeAfterDays: null },
  { steps: [{ result: 'CONTACTADO', cause: 'ACC_EXT', returnInDays: 2, afterHours: FIRST_CALL_HOURS, notes: 'Dato de prueba: caída en casa, revisión médica.' }], closeAfterDays: 2 },
  { steps: [{ result: 'CONTACTADO', cause: 'PER_TUT', returnInDays: 1, afterHours: FIRST_CALL_HOURS, notes: 'Dato de prueba: cita familiar.' }], closeAfterDays: 1 },
  { steps: [{ result: 'CONTACTADO', cause: 'ENF_CASA', returnInDays: 2, afterHours: FIRST_CALL_HOURS, notes: 'Dato de prueba: infección de garganta.' }], closeAfterDays: 2 },
];

const INITIAL_STATE: FollowUpState = { cause: null, requiresMedicalRelease: false, expectedReturnDate: null, failedAttempts: 0 };

const applyStep = (state: FollowUpState, step: ContactStep, at: Date): { state: FollowUpState; nextAttemptAt: Date | null } => {
  const outcome = applyContact(state, {
    result: step.result,
    at,
    ...(step.cause === undefined ? {} : { cause: step.cause }),
    ...(step.returnInDays === undefined ? {} : { expectedReturnDate: toIsoDate(addDays(at, step.returnInDays)) }),
  });
  if (!outcome.ok) throw new Error(`Escenario de seguimiento inválido: ${outcome.reason}`);
  return { state: outcome.state, nextAttemptAt: outcome.state.nextAttemptAt };
};

/**
 * Estado del seguimiento de una ausencia. Los más recientes (`rank` < `recentCount`) quedan abiertos y sin
 * llamadas, para que quien prueba los trabaje; el resto recorre los escenarios y su estado sale de las mismas
 * reglas del dominio (`applyContact`) que usa la API, no de valores escritos a mano.
 */
export function followUpScenario(index: number, rank: number, recentCount: number, absenceAt: Date): FollowUpScenario {
  if (rank < recentCount) {
    return { status: 'ABIERTO', cause: null, requiresMedicalRelease: false, expectedReturnDate: null, contacts: [], release: false, closedAt: null };
  }
  const spec = SCENARIOS[index % SCENARIOS.length] as ScenarioSpec;
  let state = INITIAL_STATE;
  let cursor = absenceAt;
  const contacts: PlannedContact[] = spec.steps.map((step, position) => {
    cursor = new Date(cursor.getTime() + step.afterHours * MS_PER_HOUR);
    const applied = applyStep(state, step, cursor);
    state = applied.state;
    return { attemptNumber: position + 1, occurredAt: cursor, result: step.result, nextAttemptAt: applied.nextAttemptAt, notes: step.notes ?? null };
  });
  const closedAt = spec.closeAfterDays === null ? null : addDays(absenceAt, spec.closeAfterDays);
  return {
    status: closedAt === null ? 'CLASIFICADO' : 'CERRADO',
    cause: state.cause,
    requiresMedicalRelease: state.requiresMedicalRelease,
    expectedReturnDate: state.expectedReturnDate,
    contacts,
    release: closedAt !== null && state.requiresMedicalRelease,
    closedAt,
  };
}
