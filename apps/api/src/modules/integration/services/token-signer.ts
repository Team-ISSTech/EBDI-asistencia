import { createHmac, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type IntegrationScope, isIntegrationScope } from '@sirai/auth';
import type { ApiEnv } from '@sirai/config';
import { jwtVerify, SignJWT } from 'jose';
import { API_ENV } from '../../../common/config/config.module';

const ISSUER = 'sirai';
const AUDIENCE = 'sirai-integracion';
/** Versión de la llave de firma: permite rotarla sin aceptar tokens de la versión anterior. */
const KEY_VERSION = 'v1';
const ALGORITHM = 'HS256';
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

export interface TokenClaims {
  readonly systemId: number;
  readonly scopes: readonly IntegrationScope[];
}

export interface SignedToken {
  readonly token: string;
  readonly expiresIn: number;
}

/**
 * JWT de los sistemas externos (RF-37): HS256 con una llave del servidor, de
 * vida corta. Solo dice quién es el sistema y qué alcances pidió; la API
 * vuelve a comprobar en la base que el sistema siga activo y con esos alcances, así
 * que revocar o recortar permisos surte efecto sin esperar a que el token venza.
 * El algoritmo está fijo: un token con otro (incluido `none`) se rechaza.
 */
@Injectable()
export class TokenSigner {
  private readonly key: Uint8Array;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    // Sin llave propia (solo fuera de producción) se deriva de la de cifrado con otro propósito.
    const secret = env.API_TOKEN_SECRET ?? createHmac('sha256', Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex')).update('sirai-integration-token-key').digest('hex');
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: TokenClaims, now = new Date()): Promise<SignedToken> {
    const expiresIn = this.env.INTEGRATION_TOKEN_MINUTES * SECONDS_PER_MINUTE;
    const issuedAt = Math.floor(now.getTime() / MS_PER_SECOND);
    const token = await new SignJWT({ scope: claims.scopes.join(' ') })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT', kid: KEY_VERSION })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(String(claims.systemId))
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + expiresIn)
      .sign(this.key);
    return { token, expiresIn };
  }

  /** Los claims si la firma, el algoritmo, el emisor, el destinatario, la versión y la vigencia son correctos; si no, `null`. */
  async verify(token: string, now = new Date()): Promise<TokenClaims | null> {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.key, { algorithms: [ALGORITHM], issuer: ISSUER, audience: AUDIENCE, currentDate: now });
      const systemId = Number(payload.sub);
      if (protectedHeader.kid !== KEY_VERSION || !Number.isInteger(systemId) || systemId <= 0) return null;
      const scope = typeof payload['scope'] === 'string' ? payload['scope'] : '';
      return { systemId, scopes: scope.split(' ').filter(isIntegrationScope) };
    } catch {
      return null;
    }
  }
}
