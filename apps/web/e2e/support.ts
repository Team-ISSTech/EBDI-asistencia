import { expect, type Page } from '@playwright/test';

const PASSWORD = process.env['SEED_PASSWORD'];
if (!PASSWORD) throw new Error('Define SEED_PASSWORD (en .env o en el entorno) para las pruebas e2e.');

/** Contraseña de los usuarios ficticios de la semilla de desarrollo. */
export const SEED_PASSWORD: string = PASSWORD;
export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3100';
export const SURNAME = 'Prueba';
export const today = (): string => new Date().toLocaleDateString('en-CA');

/** Sufijo de esta corrida: hace únicos los nombres y las matrículas que se siembran. */
export const RUN = Date.now().toString(36);
const MS_PER_DAY = 86_400_000;
/** Edad que admite cada sala de la semilla: Lactantes (0-18 meses, cupo 12) y Maternal (19-48 meses, cupo 20). */
const ROOMS = { Lactantes: 180, Maternal: 900 } as const;
export type SeedRoom = keyof typeof ROOMS;

/** Llena y envía el formulario de inicio de sesión con un usuario de la semilla (`<rol>@sirai.test`). */
export async function submitLogin(page: Page, email: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Inicia sesión como la directora de la semilla y espera el pase de lista. */
export async function loginAsDirector(page: Page): Promise<void> {
  await submitLogin(page, 'directora@sirai.test');
  await expect(page).toHaveURL(/\/app\/pase-de-lista$/);
}

export interface SeededChild {
  readonly id: number;
  readonly name: string;
  readonly enrollmentNumber: string;
}

/**
 * Inscribe infantes ficticios en una sala matutina (Lactantes por omisión); requiere una sesión con
 * permiso de alta. Las pruebas que no necesitan Lactantes usan Maternal para no llenar su cupo.
 */
export async function seedChildren(page: Page, prefix: string, count: number, room: SeedRoom = 'Lactantes'): Promise<SeededChild[]> {
  const rooms = await page.request.get(`${API_URL}/salas`);
  const roomId = ((await rooms.json()) as { rooms: { id: number; name: string; shift: string }[] }).rooms.find((candidate) => candidate.shift === 'MATUTINO' && candidate.name.startsWith(room))?.id;
  const birthDate = new Date(Date.now() - ROOMS[room] * MS_PER_DAY).toISOString().slice(0, 10);
  const seeded: SeededChild[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = `${prefix}${index}${RUN}`;
    const enrollmentNumber = `E2E${prefix.slice(0, 3)}${RUN}${index}`.toUpperCase();
    const response = await page.request.post(`${API_URL}/infantes`, { data: { enrollmentNumber, name, paternalSurname: SURNAME, birthDate, roomId } });
    expect(response.ok(), await response.text()).toBe(true);
    seeded.push({ id: ((await response.json()) as { id: number }).id, name, enrollmentNumber });
  }
  return seeded;
}

/** Marca la asistencia de hoy por la API (preparación; el pase de lista real se prueba en roll-call.spec.ts). */
export async function markViaApi(page: Page, enrollmentNumber: string, status: string): Promise<void> {
  const journey = await page.request.get(`${API_URL}/asistencia/jornadas/activa?date=${today()}&shift=MATUTINO`);
  const { id } = (await journey.json()) as { id: number };
  const roster = (await (await page.request.get(`${API_URL}/asistencia/jornadas/${id}/lista`)).json()) as { entries: { enrollmentId: number; enrollmentNumber: string }[] };
  const enrollmentId = roster.entries.find((entry) => entry.enrollmentNumber === enrollmentNumber)?.enrollmentId;
  const response = await page.request.post(`${API_URL}/asistencia/jornadas/${id}/registros`, { data: { marks: [{ enrollmentId, status, clientId: crypto.randomUUID() }] } });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Abre la jornada matutina de hoy; si ya estaba abierta, la deja como está. */
export async function openJourney(page: Page): Promise<void> {
  const opened = await page.request.post(`${API_URL}/asistencia/jornadas`, { data: { date: today(), shift: 'MATUTINO' } });
  expect([201, 409]).toContain(opened.status());
}
