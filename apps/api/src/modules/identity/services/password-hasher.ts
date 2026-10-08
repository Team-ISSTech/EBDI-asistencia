import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Contrato para poder sustituirlo en pruebas unitarias. */
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(hash: string, plain: string): Promise<boolean>;
}

/** argon2id, el algoritmo recomendado por OWASP para contraseñas. */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain).catch(() => false);
  }
}
