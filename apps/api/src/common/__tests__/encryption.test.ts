import type { ApiEnv } from '@sirai/config';
import { describe, expect, it } from 'vitest';
import { EncryptionService } from '../crypto/encryption.service';

const env = { DATA_ENCRYPTION_KEY: 'a'.repeat(64) } as ApiEnv;
const otherEnv = { DATA_ENCRYPTION_KEY: 'b'.repeat(64) } as ApiEnv;

describe('EncryptionService', () => {
  const service = new EncryptionService(env);

  it('descifra lo que cifró', () => {
    expect(service.decrypt(service.encrypt('teléfono 55-1234'))).toBe('teléfono 55-1234');
  });

  it('descifra el JSON que cifró, y conserva el nulo', () => {
    expect(service.decryptJson(service.encryptJson({ name: 'A', n: [1, 2] }))).toEqual({ name: 'A', n: [1, 2] });
    expect(service.decryptJson(null)).toBeNull();
    expect(service.decryptJson(service.encryptJson(null))).toBeNull();
  });

  it('un blob que no es JSON no tumba al llamador: devuelve nulo', () => {
    expect(service.decryptJson(service.encrypt('esto no es json {'))).toBeNull();
    expect(service.decryptJson(Buffer.from('basura'))).toBeNull();
  });

  it('produce blobs distintos para el mismo texto (iv aleatorio)', () => {
    expect(service.encrypt('x').equals(service.encrypt('x'))).toBe(false);
  });

  it('rechaza un blob alterado o cifrado con otra llave', () => {
    const blob = service.encrypt('secreto');
    const tampered = Buffer.from(blob);
    const last = tampered.length - 1;
    tampered.writeUInt8(tampered.readUInt8(last) ^ 0xff, last);
    expect(() => service.decrypt(tampered)).toThrow();
    expect(() => new EncryptionService(otherEnv).decrypt(blob)).toThrow();
  });

  it('rechaza versiones de llave desconocidas', () => {
    const blob = service.encrypt('x');
    blob[0] = 9;
    expect(() => service.decrypt(blob)).toThrow(/Versión de llave/);
  });

  it('encryptJson conserva null y cifra objetos', () => {
    expect(service.encryptJson(null)).toBeNull();
    const blob = service.encryptJson({ a: 1 });
    expect(blob && JSON.parse(service.decrypt(blob))).toEqual({ a: 1 });
  });

  describe('blindHash', () => {
    it('es determinista, de 32 bytes y no revierte por fuerza bruta sin la llave', () => {
      const hash = service.blindHash('5512345678');
      expect(hash).toHaveLength(32);
      expect(service.blindHash('5512345678').equals(hash)).toBe(true);
      expect(service.blindHash('5512345679').equals(hash)).toBe(false);
    });

    it('depende de la llave: otra llave produce otro hash', () => {
      expect(new EncryptionService(otherEnv).blindHash('5512345678').equals(service.blindHash('5512345678'))).toBe(false);
    });
  });

  describe('seal (sello de expedientes)', () => {
    it('es un HMAC determinista de 32 bytes que depende de la llave', () => {
      const seal = service.seal('EXP-2026-000042|5|2026-10-15T12:00:00.000Z|abc');
      expect(seal).toHaveLength(32);
      expect(service.seal('EXP-2026-000042|5|2026-10-15T12:00:00.000Z|abc').equals(seal)).toBe(true);
      expect(service.seal('EXP-2026-000043|5|2026-10-15T12:00:00.000Z|abc').equals(seal)).toBe(false);
      expect(new EncryptionService(otherEnv).seal('EXP-2026-000042|5|2026-10-15T12:00:00.000Z|abc').equals(seal)).toBe(false);
    });

    it('no coincide con el hash ciego de otro uso, aunque el texto sea el mismo (separación de dominios)', () => {
      expect(service.seal('5512345678').equals(service.blindHash('5512345678'))).toBe(false);
    });
  });
});
