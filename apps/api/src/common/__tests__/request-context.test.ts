import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { extractRequestContext, packIp, type RequestWithId, unpackIp } from '../http/request-context';
import { requestIdMiddleware } from '../http/request-id.middleware';

describe('packIp', () => {
  it('empaqueta IPv4 en 4 bytes', () => {
    expect(packIp('10.0.0.255')).toEqual(Buffer.from([10, 0, 0, 255]));
  });

  it('normaliza IPv4 mapeada en IPv6', () => {
    expect(packIp('::ffff:192.168.1.2')).toEqual(Buffer.from([192, 168, 1, 2]));
  });

  it('empaqueta IPv6 en 16 bytes expandiendo ::', () => {
    const packed = packIp('2001:db8::1');
    expect(packed).toHaveLength(16);
    expect(packed?.readUInt16BE(0)).toBe(0x2001);
    expect(packed?.readUInt16BE(14)).toBe(1);
  });

  it('devuelve null para valores no IP', () => {
    expect(packIp('localhost')).toBeNull();
    expect(packIp(null)).toBeNull();
  });
});

describe('unpackIp', () => {
  it('devuelve el texto de una IPv4 y de una IPv6 empaquetadas', () => {
    expect(unpackIp(packIp('10.0.0.255'))).toBe('10.0.0.255');
    expect(unpackIp(packIp('2001:db8::1'))).toBe('2001:db8::1');
    expect(unpackIp(packIp('::1'))).toBe('::1');
  });

  it('no inventa una IP: nulo, vacío o de largo raro devuelven null', () => {
    expect(unpackIp(null)).toBeNull();
    expect(unpackIp(Buffer.alloc(0))).toBeNull();
    expect(unpackIp(Buffer.from([1, 2, 3]))).toBeNull();
  });
});

describe('extractRequestContext', () => {
  it('toma ip, user agent e id de la petición', () => {
    const request = { ip: '::ffff:1.2.3.4', id: 'abc', get: () => 'Agente/1.0' } as unknown as Request;
    expect(extractRequestContext(request)).toEqual({ ip: '1.2.3.4', userAgent: 'Agente/1.0', requestId: 'abc' });
  });
});

describe('requestIdMiddleware', () => {
  const run = (incoming?: string): { request: RequestWithId; header: string | undefined } => {
    const request = { get: () => incoming } as unknown as RequestWithId;
    let header: string | undefined;
    const response = { setHeader: (_name: string, value: string) => (header = value) } as unknown as Response;
    requestIdMiddleware(request, response, vi.fn());
    return { request, header };
  };

  it('genera un UUID cuando no viene uno', () => {
    const { request, header } = run();
    expect(request.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(header).toBe(request.id);
  });

  it('respeta un UUID válido entrante y descarta basura', () => {
    const valid = '123e4567-e89b-12d3-a456-426614174000';
    expect(run(valid).request.id).toBe(valid);
    expect(run('<script>').request.id).not.toBe('<script>');
  });
});
