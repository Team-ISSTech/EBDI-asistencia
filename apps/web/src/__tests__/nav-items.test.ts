import { describe, expect, it } from 'vitest';
import { landingPathFor, NAV_ITEMS, visibleNavItems } from '../app/nav-items';

describe('visibleNavItems', () => {
  it('una docente ve solo operación', () => {
    const items = visibleNavItems(['ASISTENCIA_CONSULTAR', 'ASISTENCIA_REGISTRAR']);
    expect(items.map((i) => i.label)).toEqual(['Pase de lista', 'Infantes']);
  });

  it('administración central ve usuarios, auditoría y reportes, nunca pase de lista', () => {
    const items = visibleNavItems(['USUARIO_ADMINISTRAR', 'AUDITORIA_CONSULTAR', 'REPORTE_AGREGADO_CONSULTAR']);
    expect(items.map((i) => i.label)).toEqual(['Reportes', 'Usuarios', 'Auditoría']);
  });

  it('sin permisos no hay menú ni pantalla inicial', () => {
    expect(visibleNavItems([])).toEqual([]);
    expect(landingPathFor([])).toBeNull();
  });

  it('la pantalla inicial es la primera visible en el orden del menú', () => {
    expect(landingPathFor(['REPORTE_AGREGADO_CONSULTAR'])).toBe('/app/reportes');
    expect(NAV_ITEMS[0]?.path).toBe('/app/pase-de-lista');
  });
});
