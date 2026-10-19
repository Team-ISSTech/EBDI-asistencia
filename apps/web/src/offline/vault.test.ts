import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineDb } from './db';
import { Vault } from './vault';

let counter = 0;
const newDb = () => new OfflineDb(`vault-test-${counter++}`);

describe('Vault (RF-20, cifrado en la tablet)', () => {
  const opened: OfflineDb[] = [];
  const db = () => {
    const created = newDb();
    opened.push(created);
    return created;
  };
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((d) => d.delete()));
  });

  it('descifra lo que cifró', async () => {
    const vault = new Vault(db());
    const value = { notes: 'Nota sensible', marks: [{ enrollmentId: 1, status: 'PRESENTE' }] };
    expect(await vault.open(await vault.seal(value))).toEqual(value);
  });

  it('lo guardado no contiene el texto original', async () => {
    const vault = new Vault(db());
    const sealed = await vault.seal({ notes: 'Nota sensible de asesoría' });
    expect(new TextDecoder().decode(sealed)).not.toContain('Nota sensible');
    expect(Buffer.from(sealed).toString('base64')).not.toContain('Nota');
  });

  it('el mismo contenido cifra distinto cada vez', async () => {
    const vault = new Vault(db());
    const [a, b] = [await vault.seal('x'), await vault.seal('x')];
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('un contenido alterado no se abre', async () => {
    const vault = new Vault(db());
    const sealed = await vault.seal({ a: 1 });
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 0xff;
    expect(await vault.open(sealed)).toBeNull();
    expect(await vault.open(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(await vault.open(new Uint8Array(0))).toBeNull();
  });

  it('la llave es no extraíble y sobrevive a una nueva instancia sobre el mismo almacén', async () => {
    const shared = db();
    const sealed = await new Vault(shared).seal({ a: 1 });
    expect(await new Vault(shared).open(sealed)).toEqual({ a: 1 });
    const stored = await shared.keys.get('main');
    expect(stored?.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', stored?.key as CryptoKey)).rejects.toThrow();
  });

  it('otro almacén (otra llave) no puede abrir lo cifrado', async () => {
    const sealed = await new Vault(db()).seal({ a: 1 });
    expect(await new Vault(db()).open(sealed)).toBeNull();
  });

  it('dos instancias que arrancan a la vez terminan usando la misma llave', async () => {
    const shared = db();
    const [one, two] = [new Vault(shared), new Vault(shared)];
    const sealed = await one.seal({ a: 1 });
    expect(await two.open(sealed)).toEqual({ a: 1 });
    expect(await shared.keys.count()).toBe(1);
  });
});
