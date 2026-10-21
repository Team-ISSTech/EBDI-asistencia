import { type Browser, expect, type Page, test } from '@playwright/test';
import { API_URL, loginAsDirector, openJourney, type SeededChild, seedChildren, submitLogin, today } from './support';

/**
 * Salida e incidencias (S-27) como las vive el personal: la docente pasa lista, registra la salida con
 * el tutor autorizado y una incidencia; trabajo social lee la descripción. Todo por la interfaz; lo
 * guardado se comprueba en el servidor.
 */
const DESCRIPTION = 'Se raspó la rodilla en el patio; se lavó y se avisó a la mamá.';

let child: SeededChild;

async function linkGuardian(page: Page, childId: number, name: string, canPickUp: boolean): Promise<void> {
  const created = await page.request.post(`${API_URL}/tutores`, { data: { name, paternalSurname: 'Prueba', phone: '5550000000' } });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as { id: number };
  const linked = await page.request.post(`${API_URL}/infantes/${childId}/tutores`, { data: { guardianId: id, relationship: canPickUp ? 'Madre' : 'Tío', canPickUp, validFrom: today() } });
  expect(linked.ok(), await linked.text()).toBe(true);
}

/** Cada persona en su propio navegador, como en tabletas distintas. */
async function pageFor(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await submitLogin(page, email);
  await expect(page).toHaveURL(/\/app\/pase-de-lista$/);
  return page;
}

async function savedRecord(page: Page): Promise<{ status: string | null; leftAt: string | null; incidentCount: number }> {
  const journey = await page.request.get(`${API_URL}/asistencia/jornadas/activa?date=${today()}&shift=MATUTINO`);
  const { id } = (await journey.json()) as { id: number };
  const { entries } = (await (await page.request.get(`${API_URL}/asistencia/jornadas/${id}/lista`)).json()) as { entries: { childName: string; status: string | null; leftAt: string | null; incidentCount: number }[] };
  const entry = entries.find((candidate) => candidate.childName.startsWith(child.name));
  if (!entry) throw new Error('El infante no está en la lista.');
  return entry;
}

test.describe.serial('salida e incidencias en el pase de lista', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsDirector(page);
    [child] = (await seedChildren(page, 'Salida', 1, 'Maternal')) as [SeededChild];
    await linkGuardian(page, child.id, 'Recoge', true);
    await linkGuardian(page, child.id, 'NoRecoge', false);
    await openJourney(page);
    await page.close();
  });

  test('la docente registra la salida con el tutor autorizado y una incidencia; ya no puede cambiar la asistencia', async ({ browser }) => {
    const page = await pageFor(browser, 'docente@sirai.test');
    const row = page.getByRole('row').filter({ hasText: child.name });

    // Pasa lista a este infante y guarda.
    await row.getByRole('button', { name: 'Presente' }).click();
    await page.getByRole('button', { name: 'Guardar asistencia' }).click();
    await expect(row.getByText('En la estancia')).toBeVisible();

    // Salida: solo aparece quien está autorizado a recoger.
    await row.getByRole('button', { name: `Salida e incidencias de ${child.name}` }).click();
    await expect(page.getByLabel('Recoge Prueba (Madre)')).toBeVisible();
    await expect(page.getByText('NoRecoge')).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirmar salida' }).click();
    await expect(page.getByRole('alert')).toHaveText('Elige quién recoge al infante.');
    await page.getByLabel('Recoge Prueba (Madre)').check();
    await page.getByRole('button', { name: 'Confirmar salida' }).click();
    await expect(page.getByText(/^Salió a las \d{2}:\d{2}\.$/)).toBeVisible();
    await expect(row.getByText(/Salió \d{2}:\d{2}/)).toBeVisible();

    // Incidencia: la docente la registra, ve el tipo y no la descripción.
    await page.getByLabel('Tipo de incidencia').selectOption({ label: 'Accidente' });
    await page.getByLabel('Qué pasó').fill(DESCRIPTION);
    await page.getByRole('button', { name: 'Registrar incidencia' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Accidente' })).toBeVisible();
    await expect(page.getByLabel('Qué pasó')).toHaveValue('');
    await expect(page.getByText(DESCRIPTION)).toHaveCount(0);
    await expect(row.getByText(/1 incidencia/)).toBeVisible();

    // Tras la salida, cambiarle la asistencia no se guarda.
    await row.getByRole('button', { name: 'Falta injustificada' }).click();
    await page.getByRole('button', { name: 'Guardar asistencia' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudo guardar la asistencia' })).toBeVisible();

    const saved = await savedRecord(page);
    expect(saved).toMatchObject({ status: 'PRESENTE', incidentCount: 1 });
    expect(saved.leftAt).not.toBeNull();
  });

  test('trabajo social ve la descripción de la incidencia y no puede registrar salidas', async ({ browser }) => {
    const page = await pageFor(browser, 'trabajo_social@sirai.test');
    const row = page.getByRole('row').filter({ hasText: child.name });
    await row.getByRole('button', { name: `Salida e incidencias de ${child.name}` }).click();
    await expect(page.getByText(DESCRIPTION)).toBeVisible();
    await expect(page.getByText(/^Salió a las/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar incidencia' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirmar salida' })).toHaveCount(0);
  });
});
