import { expect, type Page } from '@playwright/test';

const PASSWORD = process.env['SEED_PASSWORD'];
if (!PASSWORD) throw new Error('Define SEED_PASSWORD (en .env o en el entorno) para las pruebas e2e.');

/** Contraseña de los usuarios ficticios de la semilla de desarrollo. */
export const SEED_PASSWORD: string = PASSWORD;
export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3100';

/** Inicia sesión como la directora de la semilla y espera el pase de lista. */
export async function loginAsDirector(page: Page): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo').fill('directora@sirai.test');
  await page.getByLabel('Contraseña').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/pase-de-lista$/);
}
