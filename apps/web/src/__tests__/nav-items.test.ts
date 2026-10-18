import { describe, expect, it } from 'vitest';
import { landingPathFor, NAV_ITEMS, visibleNavItems } from '../app/nav-items';

describe('visibleNavItems', () => {
  it('una docente ve solo operación', () => {
    const items = visibleNavItems(['ASISTENCIA_CONSULTAR', 'ASISTENCIA_REGISTRAR', 'INFANTE_CONSULTAR']);
    expect(items.map((i) => i.label)).toEqual(['Pase de lista', 'Infantes']);
  });

  it('infantes depende de su propio permiso, no del de asistencia', () => {
    expect(visibleNavItems(['ASISTENCIA_CONSULTAR']).map((i) => i.label)).toEqual(['Pase de lista']);
  });

  it('administración central ve usuarios, estancias, sistemas, auditoría y reportes, nunca pase de lista', () => {
    const items = visibleNavItems(['USUARIO_ADMINISTRAR', 'ESTANCIA_ADMINISTRAR', 'SISTEMA_ADMINISTRAR', 'AUDITORIA_CONSULTAR', 'REPORTE_AGREGADO_CONSULTAR']);
    expect(items.map((i) => i.label)).toEqual(['Reportes', 'Usuarios', 'Estancias', 'Sistemas', 'Auditoría']);
  });

  it('la directora ve el catálogo de salas de su estancia', () => {
    expect(visibleNavItems(['SALA_ADMINISTRAR']).map((i) => i.label)).toEqual(['Salas']);
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
