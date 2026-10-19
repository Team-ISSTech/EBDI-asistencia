import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineDb } from './db';
import { ReadCache, SessionSnapshot } from './read-cache';
import { Vault } from './vault';

let counter = 0;
const NOW = new Date('2026-10-18T12:00:00Z').getTime();
const DAY = 86_400_000;

describe('ReadCache (consultar sin conexión)', () => {
  let db: OfflineDb;
  let clock = NOW;
  let cache: ReadCache;

  beforeEach(() => {
    clock = NOW;
    db = new OfflineDb(`cache-test-${counter++}`);
    cache = new ReadCache(db, new Vault(db), () => clock);
  });
  afterEach(async () => {
    await db.delete();
  });

  it('guarda y devuelve lo consultado, con cuándo se guardó', async () => {
    await cache.put(1, 'roster:3', { entries: [{ childName: 'Infante Uno', enrollmentId: 4 }] });
    expect(await cache.get(1, 'roster:3')).toEqual({ value: { entries: [{ childName: 'Infante Uno', enrollmentId: 4 }] }, storedAt: NOW });
  });

  it('lo guardado (nombres de menores incluidos) solo existe cifrado', async () => {
    await cache.put(1, 'roster:3', { childName: 'Infante Uno Prueba' });
    const [row] = await db.cache.toArray();
    const text = JSON.stringify(row, (_key, value: unknown) => (value instanceof Uint8Array ? Buffer.from(value).toString('latin1') : value));
    expect(text).not.toContain('Infante');
  });

  it('puede guardar nulo (por ejemplo "no hay jornada abierta")', async () => {
    await cache.put(1, 'journey:2026-10-18:MATUTINO', null);
    expect(await cache.get(1, 'journey:2026-10-18:MATUTINO')).toEqual({ value: null, storedAt: NOW });
  });

  it('sin nada guardado devuelve nulo', async () => {
    expect(await cache.get(1, 'roster:99')).toBeNull();
  });

  it('cada persona ve solo lo suyo, aunque la clave coincida', async () => {
    await cache.put(1, 'follow-ups', { id: 'de-uno' });
    await cache.put(2, 'follow-ups', { id: 'de-dos' });
    expect((await cache.get(1, 'follow-ups'))?.value).toEqual({ id: 'de-uno' });
    expect((await cache.get(2, 'follow-ups'))?.value).toEqual({ id: 'de-dos' });
    expect(await cache.get(3, 'follow-ups')).toBeNull();
  });

  it('guardar de nuevo reemplaza lo anterior', async () => {
    await cache.put(1, 'roster:3', { v: 1 });
    clock += 1000;
    await cache.put(1, 'roster:3', { v: 2 });
    expect(await cache.get(1, 'roster:3')).toEqual({ value: { v: 2 }, storedAt: NOW + 1000 });
    expect(await db.cache.count()).toBe(1);
  });

  it('al cerrar sesión se borra todo lo de esa persona y solo eso', async () => {
    await cache.put(1, 'a', 1);
    await cache.put(1, 'b', 2);
    await cache.put(2, 'a', 3);
    await cache.clearUser(1);
    expect(await cache.get(1, 'a')).toBeNull();
    expect(await cache.get(1, 'b')).toBeNull();
    expect((await cache.get(2, 'a'))?.value).toBe(3);
  });

  it('lo viejo se depura: lo de más de N días ya no se conserva', async () => {
    await cache.put(1, 'viejo', 1);
    clock += 8 * DAY;
    await cache.put(1, 'nuevo', 2);
    await cache.purgeOlderThan(7 * DAY);
    expect(await cache.get(1, 'viejo')).toBeNull();
    expect((await cache.get(1, 'nuevo'))?.value).toBe(2);
  });

  it('un contenido que ya no se puede descifrar se trata como si no estuviera', async () => {
    await cache.put(1, 'roster:3', { a: 1 });
    const [row] = await db.cache.toArray();
    await db.cache.put({ ...(row as NonNullable<typeof row>), sealed: new Uint8Array([1, 2, 3]) });
    expect(await cache.get(1, 'roster:3')).toBeNull();
  });
});

describe('SessionSnapshot (abrir la aplicación sin conexión)', () => {
  let db: OfflineDb;
  let snapshot: SessionSnapshot;

  beforeEach(() => {
    db = new OfflineDb(`snapshot-test-${counter++}`);
    snapshot = new SessionSnapshot(db, new Vault(db));
  });
  afterEach(async () => {
    await db.delete();
  });

  it('guarda la última sesión conocida, cifrada, y la devuelve', async () => {
    const session = { user: { id: 1, name: 'Docente Prueba', email: 'docente@sirai.test' }, permissions: ['ASISTENCIA_CONSULTAR'] };
    await snapshot.save(session);
    expect(await snapshot.load()).toEqual(session);
    const [row] = await db.cache.toArray();
    const text = JSON.stringify(row, (_key, value: unknown) => (value instanceof Uint8Array ? Buffer.from(value).toString('latin1') : value));
    expect(text).not.toContain('docente@sirai.test');
  });

  it('sin sesión guardada, o tras borrarla, devuelve nulo', async () => {
    expect(await snapshot.load()).toBeNull();
    await snapshot.save({ a: 1 });
    await snapshot.clear();
    expect(await snapshot.load()).toBeNull();
  });
});
