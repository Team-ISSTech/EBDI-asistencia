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
const birthDate = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);

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
  readonly name: string;
  readonly enrollmentNumber: string;
}

/** Inscribe infantes ficticios en la primera sala matutina; requiere una sesión con permiso de alta. */
export async function seedChildren(page: Page, prefix: string, count: number): Promise<SeededChild[]> {
  const rooms = await page.request.get(`${API_URL}/salas`);
  const roomId = ((await rooms.json()) as { rooms: { id: number; shift: string }[] }).rooms.find((room) => room.shift === 'MATUTINO')?.id;
  const children = Array.from({ length: count }, (_, index) => ({ name: `${prefix}${index}${RUN}`, enrollmentNumber: `E2E${prefix.slice(0, 3)}${RUN}${index}`.toUpperCase() }));
  for (const child of children) {
    const response = await page.request.post(`${API_URL}/infantes`, {
      data: { enrollmentNumber: child.enrollmentNumber, name: child.name, paternalSurname: SURNAME, birthDate, roomId },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  return children;
}

/** Abre la jornada matutina de hoy; si ya estaba abierta, la deja como está. */
export async function openJourney(page: Page): Promise<void> {
  const opened = await page.request.post(`${API_URL}/asistencia/jornadas`, { data: { date: today(), shift: 'MATUTINO' } });
  expect([201, 409]).toContain(opened.status());
}
