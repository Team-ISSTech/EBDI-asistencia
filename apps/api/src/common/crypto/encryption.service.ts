import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import { API_ENV } from '../config/config.module';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1;

/**
 * Cifrado AES-256-GCM para columnas sensibles (RNF-01). Formato del blob:
 * [versión de llave 1 byte][iv 12 bytes][tag 16 bytes][texto cifrado].
 * La versión va como dato autenticado adicional (AAD): cambiarla en el blob
 * invalida la etiqueta. Permite rotar la llave sin reescribir todo de golpe.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.key = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from([KEY_VERSION]));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([KEY_VERSION]), iv, cipher.getAuthTag(), encrypted]);
  }

  decrypt(blob: Buffer): string {
    const version = blob.readUInt8(0);
    if (version !== KEY_VERSION) {
      throw new Error(`Versión de llave desconocida: ${version}`);
    }
    const iv = blob.subarray(HEADER_BYTES, HEADER_BYTES + IV_BYTES);
    const tag = blob.subarray(HEADER_BYTES + IV_BYTES, HEADER_BYTES + IV_BYTES + TAG_BYTES);
    const encrypted = blob.subarray(HEADER_BYTES + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAAD(Buffer.from([version]));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  /**
   * Hash con llave (HMAC-SHA256) para buscar por un dato cifrado, como el
   * teléfono, sin descifrar. Un SHA-256 simple de un teléfono de 10 dígitos se
   * revierte por fuerza bruta en segundos; con la llave del servidor, no.
   */
  blindHash(value: string): Buffer {
    return createHmac('sha256', this.key).update(`blind-hash:${value}`).digest();
  }

  /**
   * Sello de un expediente emitido (RF-19): HMAC-SHA256 con la llave del
   * servidor. Quien no la tiene no puede fabricar un sello válido. El prefijo
   * separa este uso del de `blindHash`, aunque el texto coincida.
   */
  seal(message: string): Buffer {
    return createHmac('sha256', this.key).update(`dossier-seal:${message}`).digest();
  }

  /** Serializa y cifra un objeto; `null` se conserva como `null`. */
  encryptJson(value: unknown): Buffer | null {
    return value === null || value === undefined ? null : this.encrypt(JSON.stringify(value));
  }
}
