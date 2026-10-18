import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { testEnv } from '../../identity/__tests__/in-memory';
import { TokenSigner } from '../services/token-signer';

const NOW = new Date('2026-10-18T12:00:00Z');
const MINUTE = 60_000;

describe('TokenSigner (RF-37)', () => {
  const signer = new TokenSigner({ ...testEnv, API_TOKEN_SECRET: 's'.repeat(40) });

  it('firma un token que se verifica y trae el sistema y los alcances', async () => {
    const { token, expiresIn } = await signer.sign({ systemId: 5, scopes: ['REPORTE_AGREGADO_LEER'] }, NOW);
    expect(expiresIn).toBe(15 * 60);
    expect(await signer.verify(token, NOW)).toEqual({ systemId: 5, scopes: ['REPORTE_AGREGADO_LEER'] });
  });

  it('cada token lleva un identificador único', async () => {
    const [a, b] = await Promise.all([signer.sign({ systemId: 5, scopes: [] }, NOW), signer.sign({ systemId: 5, scopes: [] }, NOW)]);
    expect(a.token).not.toBe(b.token);
  });

  it('caduca a los minutos configurados, ni un instante después', async () => {
    const { token } = await signer.sign({ systemId: 5, scopes: ['REPORTE_AGREGADO_LEER'] }, NOW);
    expect(await signer.verify(token, new Date(NOW.getTime() + 15 * MINUTE - 1000))).not.toBeNull();
    expect(await signer.verify(token, new Date(NOW.getTime() + 15 * MINUTE + 1000))).toBeNull();
  });

  it('rechaza un token alterado, firmado con otra llave o que no es un token', async () => {
    const { token } = await signer.sign({ systemId: 5, scopes: ['REPORTE_AGREGADO_LEER'] }, NOW);
    const [head, body, signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body ?? '', 'base64url').toString()), sub: '1' })).toString('base64url');
    expect(await signer.verify(`${head}.${forgedBody}.${signature}`, NOW)).toBeNull();
    const other = new TokenSigner({ ...testEnv, API_TOKEN_SECRET: 'x'.repeat(40) });
    expect(await other.verify(token, NOW)).toBeNull();
    for (const garbage of ['', 'abc', 'a.b.c', `${head}.${body}`]) expect(await signer.verify(garbage, NOW)).toBeNull();
  });

  it('rechaza `alg: none` y otros algoritmos, aunque la firma sea válida para ellos', async () => {
    const claims = Buffer.from(JSON.stringify({ sub: '5', scope: 'REPORTE_AGREGADO_LEER', iss: 'sirai', aud: 'sirai-integracion', exp: Math.floor(NOW.getTime() / 1000) + 600 })).toString('base64url');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${claims}.`;
    expect(await signer.verify(none, NOW)).toBeNull();
    const key = new TextEncoder().encode('s'.repeat(40));
    const hs512 = await new SignJWT({ scope: 'REPORTE_AGREGADO_LEER' })
      .setProtectedHeader({ alg: 'HS512', kid: 'v1' })
      .setSubject('5')
      .setIssuer('sirai')
      .setAudience('sirai-integracion')
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 600)
      .sign(key);
    expect(await signer.verify(hs512, NOW)).toBeNull();
  });

  it('rechaza un token con otro emisor, otro destinatario, otra versión de llave o sin sistema', async () => {
    const key = new TextEncoder().encode('s'.repeat(40));
    const make = (overrides: { iss?: string; aud?: string; kid?: string; sub?: string }) =>
      new SignJWT({ scope: 'REPORTE_AGREGADO_LEER' })
        .setProtectedHeader({ alg: 'HS256', kid: overrides.kid ?? 'v1' })
        .setSubject(overrides.sub ?? '5')
        .setIssuer(overrides.iss ?? 'sirai')
        .setAudience(overrides.aud ?? 'sirai-integracion')
        .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 600)
        .sign(key);
    expect(await signer.verify(await make({}), NOW)).not.toBeNull();
    for (const bad of [{ iss: 'otro' }, { aud: 'otro' }, { kid: 'v2' }, { sub: 'no-es-un-numero' }, { sub: '0' }]) {
      expect(await signer.verify(await make(bad), NOW)).toBeNull();
    }
  });

  it('descarta alcances que no existen en el catálogo, para que un token viejo no conceda de más', async () => {
    const key = new TextEncoder().encode('s'.repeat(40));
    const token = await new SignJWT({ scope: 'REPORTE_AGREGADO_LEER TODO_EL_SISTEMA' })
      .setProtectedHeader({ alg: 'HS256', kid: 'v1' })
      .setSubject('5')
      .setIssuer('sirai')
      .setAudience('sirai-integracion')
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 600)
      .sign(key);
    expect(await signer.verify(token, NOW)).toEqual({ systemId: 5, scopes: ['REPORTE_AGREGADO_LEER'] });
  });

  it('sin API_TOKEN_SECRET deriva una llave de la de cifrado, distinta a ella, y es estable', async () => {
    const derived = new TokenSigner(testEnv);
    const { token } = await derived.sign({ systemId: 5, scopes: ['REPORTE_AGREGADO_LEER'] }, NOW);
    expect(await new TokenSigner(testEnv).verify(token, NOW)).not.toBeNull();
    expect(await new TokenSigner({ ...testEnv, API_TOKEN_SECRET: testEnv.DATA_ENCRYPTION_KEY }).verify(token, NOW)).toBeNull();
  });
});
