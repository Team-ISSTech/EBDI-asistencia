import type { Server } from 'node:http';
import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { securityHeadersMiddleware } from '../http/security-headers.middleware';

@Controller('datos')
class ProbeController {
  @Get()
  read(): { ok: boolean } {
    return { ok: true };
  }
}

const appWith = async (secure: boolean): Promise<Server> => {
  const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(securityHeadersMiddleware({ hsts: secure }));
  await app.init();
  return app.getHttpServer() as Server;
};

describe('securityHeadersMiddleware (RNF-06)', () => {
  it('las respuestas de la API no se guardan en ninguna caché ni se interpretan como otra cosa', async () => {
    const response = await request(await appWith(false)).get('/datos');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['pragma']).toBe('no-cache');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('la API no se puede incrustar ni ejecutar contenido de sus respuestas', async () => {
    const response = await request(await appWith(false)).get('/datos');
    expect(response.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('no anuncia que corre sobre Express', async () => {
    expect((await request(await appWith(false)).get('/datos')).headers['x-powered-by']).toBeUndefined();
  });

  it('HSTS solo se envía cuando el servicio corre sobre HTTPS', async () => {
    expect((await request(await appWith(false)).get('/datos')).headers['strict-transport-security']).toBeUndefined();
    expect((await request(await appWith(true)).get('/datos')).headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });
});
