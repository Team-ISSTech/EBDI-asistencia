import { expect, type Page, test } from '@playwright/test';
import { API_URL, loginAsDirector, markViaApi, openJourney, type SeededChild, seedChildren, submitLogin, SURNAME } from './support';

/**
 * Llamada de seguimiento sin conexión (A14, RF-20 a RF-23) en un navegador real: trabajo social registra
 * la llamada sin red, recarga la aplicación sin red y la llamada sigue ahí; al volver la red se envía sola.
 *
 * El caso lo abre el trabajo programado al pasar las 9:00 (RF-24), así que la API debe correr con
 * FOLLOW_UP_JOB_SECONDS mayor que 0 (ver docs/operations/pruebas-sin-conexion.md). Antes de las 9:00
 * locales no hay caso que abrir y la prueba se omite.
 */
const NOTES = `Sin respuesta, se deja recado ${Date.now().toString(36)}.`;
const CUTOFF_HOUR = 9;

let child: SeededChild;

interface Ticket {
  readonly id: number;
  readonly childName: string;
}

async function ticketFor(page: Page): Promise<Ticket | undefined> {
  const response = await page.request.get(`${API_URL}/seguimientos`);
  const { followUps } = (await response.json()) as { followUps: Ticket[] };
  return followUps.find((ticket) => ticket.childName.startsWith(child.name));
}

test.beforeAll(async ({ browser }) => {
  test.skip(new Date().getHours() < CUTOFF_HOUR, 'Antes de las 9:00 el trabajo programado aún no abre casos de seguimiento.');
  const page = await browser.newPage();
  await loginAsDirector(page);
  [child] = (await seedChildren(page, 'Llamada', 1, 'Maternal')) as [SeededChild];
  await openJourney(page);
  await markViaApi(page, child.enrollmentNumber, 'FALTA_INJUSTIFICADA');
  await page.close();
});

test('la llamada registrada sin conexión sobrevive a recargar la aplicación y se envía al volver la red', async ({ page, context }) => {
  test.skip(new Date().getHours() < CUTOFF_HOUR, 'Antes de las 9:00 el trabajo programado aún no abre casos de seguimiento.');
  await submitLogin(page, 'trabajo_social@sirai.test');
  await expect(page).toHaveURL(/\/app\//);

  // El trabajo programado abre el caso por la falta injustificada.
  await expect.poll(async () => (await ticketFor(page))?.id, { timeout: 30_000 }).toBeDefined();
  const ticket = (await ticketFor(page)) as Ticket;

  // Con conexión se abre la lista (queda en la tablet) y el Service Worker toma el control.
  await page.goto('/app/seguimientos');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const childName = `${child.name} ${SURNAME}`;
  await page.getByRole('button', { name: `Llamadas de ${childName}` }).click();

  // Se cae la red y se registra la llamada.
  await context.setOffline(true);
  await page.getByLabel('No contestó').check();
  await page.getByLabel('Notas de asesoría').fill(NOTES);
  await page.getByRole('button', { name: 'Registrar llamada' }).click();
  await expect(page.getByText('Sin conexión: la llamada se guardó en esta tablet y se enviará sola.')).toBeVisible();
  await expect(page.getByText(/1 captura pendiente de enviar/)).toBeVisible();

  // Reinicio sin red: la aplicación abre y la llamada sigue pendiente.
  await page.reload();
  await expect(page.getByText(/1 captura pendiente de enviar/)).toBeVisible();
  await expect(page.getByRole('button', { name: `Llamadas de ${childName}` })).toBeVisible();

  // Vuelve la red: se envía sola y el servidor la tiene.
  await context.setOffline(false);
  await expect(page.getByText(/captura pendiente de enviar/)).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(async () => {
      const response = await page.request.get(`${API_URL}/seguimientos/${ticket.id}/contactos`);
      const { contacts } = (await response.json()) as { contacts: { result: string }[] };
      return contacts.map((contact) => contact.result);
    })
    .toEqual(['SIN_RESPUESTA']);
});
