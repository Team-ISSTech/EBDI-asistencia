import { expect, type Page, test } from '@playwright/test';
import { API_URL, loginAsDirector, openJourney, RUN, type SeededChild, seedChildren, SURNAME, today } from './support';

/**
 * Pase de lista (RF-12) y captura por matrícula (RF-13) en un navegador real.
 * Requiere la API y MySQL arriba con la semilla de desarrollo; lo guardado se
 * comprueba en el servidor, no en la pantalla.
 */
/** Guardar pasa por la API (o la cola local): se le da margen a un entorno lento. */
const SAVE_TIMEOUT = { timeout: 15_000 };

/** Estado guardado en el servidor para cada infante, en el mismo orden. */
async function savedStatuses(page: Page, children: readonly SeededChild[]): Promise<(string | null)[]> {
  const journey = await page.request.get(`${API_URL}/asistencia/jornadas/activa?date=${today()}&shift=MATUTINO`);
  const { id } = (await journey.json()) as { id: number };
  const response = await page.request.get(`${API_URL}/asistencia/jornadas/${id}/lista`);
  const { entries } = (await response.json()) as { entries: { childName: string; status: string | null }[] };
  return children.map((child) => {
    const entry = entries.find((candidate) => candidate.childName.startsWith(child.name));
    return entry ? entry.status : 'NO_EN_LISTA';
  });
}

test('pasar lista con dos clics: marcar a todos presentes y guardar', async ({ page }) => {
  await loginAsDirector(page);
  const children = await seedChildren(page, 'ClicUno', 3);
  await openJourney(page);
  await page.goto('/app/pase-de-lista');
  await expect(page.getByText(children[0]?.name ?? '')).toBeVisible();

  // Los dos únicos clics del pase de lista (RF-12: menos de 3).
  await page.getByRole('button', { name: 'Marcar a todos presentes' }).click();
  await page.getByRole('button', { name: 'Guardar asistencia' }).click();

  await expect.poll(() => savedStatuses(page, children), SAVE_TIMEOUT).toEqual(children.map(() => 'PRESENTE'));
});

test('lector, captura manual y matrícula desconocida en el pase de lista', async ({ page }) => {
  await loginAsDirector(page);
  const [scanned, typed, untouched] = await seedChildren(page, 'Escaneo', 3);
  if (!scanned || !typed || !untouched) throw new Error('No se sembraron los infantes.');
  await openJourney(page);
  await page.goto('/app/pase-de-lista');
  await expect(page.getByText(scanned.name)).toBeVisible();
  const field = page.getByLabel('Escanear o escribir matrícula');

  // Un lector USB o Bluetooth escribe la matrícula y manda Enter, como un teclado.
  await field.pressSequentially(scanned.enrollmentNumber);
  await field.press('Enter');
  await expect(page.getByRole('status')).toHaveText(`${scanned.name} ${SURNAME}: presente`);

  // Respaldo manual: quien no tiene lector la escribe (en minúsculas y con espacios) y pulsa Marcar.
  await field.fill(` ${typed.enrollmentNumber.toLowerCase()} `);
  await page.getByRole('button', { name: 'Marcar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(`${typed.name} ${SURNAME}: presente`);

  // Una matrícula que no está en el turno avisa y no marca a nadie.
  await field.fill(`NO-EXISTE-${RUN}`);
  await field.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(`No hay un infante con la matrícula NO-EXISTE-${RUN} en este turno.`);

  await page.getByRole('button', { name: 'Guardar asistencia' }).click();
  await expect.poll(() => savedStatuses(page, [scanned, typed, untouched]), SAVE_TIMEOUT).toEqual(['PRESENTE', 'PRESENTE', null]);
});
