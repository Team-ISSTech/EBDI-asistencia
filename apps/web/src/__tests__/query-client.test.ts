import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { createQueryClient } from '../app/query-client';

/** TanStack Query se entera de la conexión por los eventos del navegador, no leyendo `navigator.onLine`. */
const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};
const PAUSED = 'pausada';
const orPaused = <T>(promise: Promise<T>): Promise<T | typeof PAUSED> => Promise.race([promise, new Promise<typeof PAUSED>((resolve) => setTimeout(() => resolve(PAUSED), 300))]);

/** Como hace `QueryClientProvider`: sin montar el cliente, TanStack no escucha los eventos de conexión. */
const mounted = <T extends QueryClient>(client: T): T => {
  client.mount();
  unmounts.push(() => client.unmount());
  return client;
};
const unmounts: Array<() => void> = [];

describe('cliente de consultas sin conexión (RF-20)', () => {
  afterEach(() => {
    setOnline(true);
    for (const unmount of unmounts.splice(0)) unmount();
  });

  it('referencia: con la configuración por defecto de TanStack, sin red una mutación se queda esperando', async () => {
    const client = mounted(new QueryClient());
    setOnline(false);
    const observer = new MutationObserver(client, { mutationFn: () => Promise.resolve('guardado') });
    await expect(orPaused(observer.mutate())).resolves.toBe(PAUSED);
  });

  it('una consulta se ejecuta aunque el navegador diga que no hay red: así puede servir la copia guardada', async () => {
    const client = mounted(createQueryClient());
    setOnline(false);
    await expect(orPaused(client.fetchQuery({ queryKey: ['x'], queryFn: () => Promise.resolve('ok') }))).resolves.toBe('ok');
  });

  it('una mutación se ejecuta aunque el navegador diga que no hay red: así puede guardar en la tablet en vez de quedarse esperando', async () => {
    const client = mounted(createQueryClient());
    setOnline(false);
    const observer = new MutationObserver(client, { mutationFn: () => Promise.resolve('guardado') });
    await expect(orPaused(observer.mutate())).resolves.toBe('guardado');
  });

  it('una mutación que falla por la red falla de inmediato, sin reintentos que retrasen el aviso', async () => {
    const client = createQueryClient();
    let attempts = 0;
    const observer = new MutationObserver(client, {
      mutationFn: () => {
        attempts += 1;
        return Promise.reject(new TypeError('Failed to fetch'));
      },
    });
    await expect(observer.mutate()).rejects.toBeInstanceOf(TypeError);
    expect(attempts).toBe(1);
  });
});
