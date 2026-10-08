import { expect, test } from '@playwright/test';

const PASSWORD = process.env['SEED_PASSWORD'];
if (!PASSWORD) throw new Error('Define SEED_PASSWORD (en .env o en el entorno) para las pruebas e2e.');

test('una directora entra, ve su estancia y no ve administración', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo').fill('directora@sirai.test');
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/pase-de-lista$/);
  await expect(page.getByRole('link', { name: 'Pase de lista' })).toBeVisible();
  await expect(page.getByText('Estancia de prueba 01')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
});

test('credenciales incorrectas muestran un error claro', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo').fill('directora@sirai.test');
  await page.getByLabel('Contraseña').fill('incorrecta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
});
