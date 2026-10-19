import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = readFileSync(resolve(__dirname, '../../nginx.conf'), 'utf8');

/** Bloques `location { ... }` con su nombre; la configuración no anida llaves dentro de ellos. */
const locations = [...config.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)].map((match) => ({ name: (match[1] ?? '').trim(), body: match[2] ?? '' }));
const serverLevel = config.replace(/location\s+[^{]+\{[^}]*\}/g, '');

const REQUIRED = ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy'];

/** RNF-06: nginx no hereda `add_header` en un bloque que define el suyo; cada bloque debe repetirlas. */
describe('cabeceras de seguridad de nginx', () => {
  it('el servidor las define completas', () => {
    for (const header of REQUIRED) expect(serverLevel, header).toContain(`add_header ${header} `);
  });

  it('todo bloque que define cabeceras propias repite el conjunto completo', () => {
    const withHeaders = locations.filter((location) => location.body.includes('add_header'));
    expect(withHeaders.length).toBeGreaterThanOrEqual(3);
    for (const location of withHeaders) for (const header of REQUIRED) expect(location.body, `${location.name} → ${header}`).toContain(`add_header ${header} `);
  });

  it('la política de contenido solo admite recursos propios y prohíbe incrustar la aplicación', () => {
    const policy = /add_header Content-Security-Policy "([^"]+)"/.exec(serverLevel)?.[1] ?? '';
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|\*|https?:/);
  });

  it('la cámara queda solo para la propia aplicación (lector de matrículas) y nada más', () => {
    const policy = /add_header Permissions-Policy "([^"]+)"/.exec(serverLevel)?.[1] ?? '';
    expect(policy).toContain('camera=(self)');
    for (const feature of ['microphone', 'geolocation', 'payment']) expect(policy).toContain(`${feature}=()`);
  });
});
