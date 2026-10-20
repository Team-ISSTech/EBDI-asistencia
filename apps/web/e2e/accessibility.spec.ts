import AxeBuilder from '@axe-core/playwright';
import { ROLE_CODES } from '@sirai/auth';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { API_URL, loginAsDirector, openJourney, SEED_PASSWORD, seedChildren, submitLogin, today } from './support';

/**
 * Revisión de accesibilidad por rol (A03, RNF-14): cada pantalla del menú de
 * cada rol de la semilla pasa axe-core con WCAG 2.1 A y AA (etiquetas,
 * contraste, nombres accesibles, estructura), y el pase de lista se puede
 * hacer solo con teclado. Requiere la pila de las demás pruebas e2e.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const MAX_TABS = 60;

/** Las violaciones como texto corto, para que el fallo diga qué regla y en qué elemento. */
async function axeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`);
}

/** Espera a que la pantalla termine de cargar sus datos antes de revisarla. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Tras el login: los roles centrales pueden pasar por el selector de estancia, que también se revisa. */
async function reachApp(page: Page): Promise<string[]> {
  await expect(page).toHaveURL(/\/(app|seleccionar-estancia)(\/|$)/);
  if (!page.url().includes('/seleccionar-estancia')) return [];
  await settle(page);
  const violations = (await axeViolations(page)).map((violation) => `/seleccionar-estancia ${violation}`);
  await page.getByRole('main').getByRole('listitem').first().getByRole('button').click();
  await expect(page).toHaveURL(/\/app(\/|$)/);
  return violations;
}

async function navPaths(page: Page): Promise<string[]> {
  const links = page.getByRole('navigation', { name: 'Secciones' }).getByRole('link');
  await expect(links.first()).toBeVisible();
  return (await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''))).filter(Boolean);
}

/** Pulsa Tab hasta que el foco llegue al elemento; falla si no llega en MAX_TABS. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < MAX_TABS; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`El foco no llegó al elemento tras ${MAX_TABS} tabulaciones.`);
}

/** Margen alrededor del elemento donde puede dibujarse el anillo de foco. */
const FOCUS_RING_MARGIN = 8;

/**
 * El foco se ve: el elemento enfocado no se ve igual que sin foco. Compara
 * píxeles, no estilos, porque un contorno transparente también es un estilo.
 */
async function focusIsVisible(page: Page, target: Locator): Promise<boolean> {
  const box = await target.boundingBox();
  if (!box) throw new Error('El elemento no está en pantalla.');
  const clip = { x: box.x - FOCUS_RING_MARGIN, y: box.y - FOCUS_RING_MARGIN, width: box.width + 2 * FOCUS_RING_MARGIN, height: box.height + 2 * FOCUS_RING_MARGIN };
  const focused = await page.screenshot({ clip, animations: 'disabled' });
  await target.evaluate((element) => (element as HTMLElement).blur());
  const blurred = await page.screenshot({ clip, animations: 'disabled' });
  await target.focus();
  return !focused.equals(blurred);
}

/** Infantes sin marcar en la jornada de hoy (la prueba de teclado necesita alguno). */
async function unmarkedCount(page: Page): Promise<number> {
  const journey = await page.request.get(`${API_URL}/asistencia/jornadas/activa?date=${today()}&shift=MATUTINO`);
  const { id } = (await journey.json()) as { id: number };
  const roster = await page.request.get(`${API_URL}/asistencia/jornadas/${id}/lista`);
  const { entries } = (await roster.json()) as { entries: { status: string | null }[] };
  return entries.filter((entry) => entry.status === null).length;
}

/** Con datos, las pantallas muestran tablas y controles reales. Tras un fallo Playwright repite esto: solo siembra si hace falta. */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginAsDirector(page);
  await openJourney(page);
  if ((await unmarkedCount(page)) === 0) await seedChildren(page, 'Acceso', 2);
  await page.close();
});

test('el inicio de sesión cumple WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await settle(page);
  expect(await axeViolations(page)).toEqual([]);
});

for (const role of ROLE_CODES) {
  test(`las pantallas de ${role} cumplen WCAG 2.1 AA`, async ({ page }) => {
    await submitLogin(page, `${role.toLowerCase()}@sirai.test`);
    const violations = await reachApp(page);
    const paths = await navPaths(page);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      await page.goto(path);
      await settle(page);
      violations.push(...(await axeViolations(page)).map((violation) => `${path} ${violation}`));
    }
    expect(violations).toEqual([]);
  });
}

test('el pase de lista se hace solo con teclado y con el foco visible', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await tabTo(page, page.getByLabel('Correo'));
  await page.keyboard.type('directora@sirai.test');
  await tabTo(page, page.getByLabel('Contraseña'));
  await page.keyboard.type(SEED_PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/pase-de-lista$/);
  await settle(page);

  const markAll = page.getByRole('button', { name: 'Marcar a todos presentes' });
  await tabTo(page, markAll);
  expect(await focusIsVisible(page, markAll)).toBe(true);
  await page.keyboard.press('Enter');

  const save = page.getByRole('button', { name: 'Guardar asistencia' });
  await tabTo(page, save);
  expect(await focusIsVisible(page, save)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(save).toBeDisabled();
});
