import { expect, type Page, test } from '@playwright/test';
import { API_URL, loginAsDirector } from './support';

/**
 * Modo sin conexión (RF-20 a RF-23) en un navegador real, con la aplicación compilada (el Service Worker solo
 * existe en el build). Requiere la API y MySQL arriba con la semilla de desarrollo y la web servida
 * por `vite preview` o por la pila Docker (E2E_WEB_URL). Ver `docs/operations/pruebas-sin-conexion.md`.
 */
const RUN = Date.now().toString(36);
const CHILD_NAMES = [`NombreSecretoUno${RUN}`, `NombreSecretoDos${RUN}`, `NombreSecretoTres${RUN}`];
const birthDate = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);

async function seedChildren(page: Page): Promise<void> {
  const rooms = await page.request.get(`${API_URL}/salas`);
  const roomId = ((await rooms.json()) as { rooms: { id: number; shift: string }[] }).rooms.find((room) => room.shift === 'MATUTINO')?.id;
  for (const [index, name] of CHILD_NAMES.entries()) {
    const response = await page.request.post(`${API_URL}/infantes`, {
      data: { enrollmentNumber: `E2E-${Date.now()}-${index}`, name, paternalSurname: 'Prueba', birthDate, roomId },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
}

/** Lo que hay en el almacén local de la tablet, tal como lo ve cualquiera que lo abra. */
async function localStorageDump(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('sirai-offline');
        request.onerror = () => reject(new Error('No se pudo abrir IndexedDB'));
        request.onsuccess = () => {
          const db = request.result;
          const names = Array.from(db.objectStoreNames);
          const parts: string[] = [];
          const pending = names.map(
            (name) =>
              new Promise<void>((done) => {
                const all = db.transaction(name).objectStore(name).getAll();
                all.onsuccess = () => {
                  parts.push(JSON.stringify(all.result, (_key, value: unknown) => (value instanceof Uint8Array || value instanceof ArrayBuffer ? Array.from(new Uint8Array(value as ArrayBuffer)).map((byte) => String.fromCharCode(byte)).join('') : value)));
                  done();
                };
              }),
          );
          void Promise.all(pending).then(() => resolve(parts.join('\n')));
        };
      }),
  );
}

test('pasar lista sin conexión: se guarda cifrado en la tablet, sobrevive a recargar y se envía solo al volver la red', async ({ page, context }) => {
  await loginAsDirector(page);
  await seedChildren(page);

  // Con conexión: se abre la jornada y se carga la lista (queda guardada en la tablet).
  const opened = await page.request.post(`${API_URL}/asistencia/jornadas`, { data: { date: new Date().toLocaleDateString('en-CA'), shift: 'MATUTINO' } });
  expect([201, 409]).toContain(opened.status());
  await page.goto('/app/pase-de-lista');
  await expect(page.getByText(CHILD_NAMES[0] ?? '')).toBeVisible();

  // El Service Worker toma el control tras una recarga (no se fuerza a media captura).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.getByText(CHILD_NAMES[0] ?? '')).toBeVisible();

  // Se cae la red a media jornada.
  await context.setOffline(true);
  await expect(page.getByText(/Sin conexión\. Lo que captures se guarda en esta tablet/)).toBeVisible();
  await page.getByRole('button', { name: 'Marcar a todos presentes' }).click();
  await page.getByRole('button', { name: 'Guardar asistencia' }).click();
  await expect(page.getByText('Sin conexión: la asistencia se guardó en esta tablet y se enviará sola.')).toBeVisible();
  await expect(page.getByText(/1 captura pendiente de enviar/)).toBeVisible();

  // Lo guardado en la tablet no contiene los nombres de los niños.
  const dump = await localStorageDump(page);
  for (const name of CHILD_NAMES) expect(dump).not.toContain(name);

  // Recargar sin red: la aplicación abre (Service Worker), con la sesión y la lista guardadas, y lo marcado sigue ahí.
  await page.reload();
  await expect(page.getByText(CHILD_NAMES[0] ?? '')).toBeVisible();
  await expect(page.getByText('Mostrando datos guardados en esta tablet; pueden no estar al día.')).toBeVisible();
  for (const name of CHILD_NAMES) await expect(page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Presente', pressed: true })).toBeVisible();
  await expect(page.getByText(/1 captura pendiente de enviar/)).toBeVisible();

  // Vuelve la red: se envía sola, sin que nadie haga nada.
  await context.setOffline(false);
  await expect(page.getByText(/captura pendiente de enviar/)).toHaveCount(0, { timeout: 30_000 });

  // El servidor tiene lo capturado.
  const journey = await page.request.get(`${API_URL}/asistencia/jornadas/activa?date=${new Date().toLocaleDateString('en-CA')}&shift=MATUTINO`);
  const { id } = (await journey.json()) as { id: number };
  // Mientras se envía, el aviso de pendientes ya no está pero el servidor aún no responde: se espera a verlo.
  await expect
    .poll(async () => {
      const response = await page.request.get(`${API_URL}/asistencia/jornadas/${id}/lista`);
      const { entries } = (await response.json()) as { entries: { childName: string; status: string | null }[] };
      return entries.filter((entry) => CHILD_NAMES.some((name) => entry.childName.startsWith(name))).map((entry) => entry.status);
    })
    .toEqual(CHILD_NAMES.map(() => 'PRESENTE'));
});
