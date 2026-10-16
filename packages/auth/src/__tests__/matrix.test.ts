import { describe, expect, it } from 'vitest';
import { PERMISSION_CODES } from '../permissions.js';
import { ROLE_CODES } from '../roles.js';
import { ROLE_PERMISSIONS } from '../matrix.js';

/**
 * La matriz debe coincidir con la tabla de permisos del SRS (Fase 2) tal como
 * se fijó en docs/architecture/overview.md.
 * Cada aserción compara conjuntos para que el orden no importe.
 */
const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('ROLE_PERMISSIONS', () => {
  it('cubre todos los roles y solo roles conocidos', () => {
    expect(sorted(Object.keys(ROLE_PERMISSIONS))).toEqual(sorted(ROLE_CODES));
  });

  it('solo usa códigos de permiso conocidos', () => {
    const used = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const code of used) {
      expect(PERMISSION_CODES).toContain(code);
    }
  });

  it('DOCENTE consulta y registra asistencia, nada más', () => {
    expect(sorted(ROLE_PERMISSIONS.DOCENTE)).toEqual(
      sorted(['ASISTENCIA_CONSULTAR', 'ASISTENCIA_REGISTRAR', 'INFANTE_CONSULTAR']),
    );
  });

  it('TRABAJO_SOCIAL y ENFERMERIA comparten seguimiento y notas sensibles', () => {
    const expected = sorted([
      'ASISTENCIA_CONSULTAR',
      'INFANTE_CONSULTAR',
      'SEGUIMIENTO_CONSULTAR',
      'SEGUIMIENTO_REGISTRAR',
      'NOTA_SENSIBLE_CONSULTAR',
    ]);
    expect(sorted(ROLE_PERMISSIONS.TRABAJO_SOCIAL)).toEqual(expected);
    expect(sorted(ROLE_PERMISSIONS.ENFERMERIA)).toEqual(expected);
  });

  it('MEDICO añade el alta médica a lo de trabajo social', () => {
    expect(sorted(ROLE_PERMISSIONS.MEDICO)).toEqual(
      sorted([...ROLE_PERMISSIONS.TRABAJO_SOCIAL, 'ALTA_MEDICA_REGISTRAR']),
    );
  });

  it('DIRECTORA supervisa: docente + trabajo social + cierre de jornada + reportes', () => {
    expect(sorted(ROLE_PERMISSIONS.DIRECTORA)).toEqual(
      sorted([
        'ASISTENCIA_CONSULTAR',
        'ASISTENCIA_REGISTRAR',
        'INFANTE_CONSULTAR',
        'INFANTE_ADMINISTRAR',
        'CONSENTIMIENTO_REGISTRAR',
        'SEGUIMIENTO_CONSULTAR',
        'SEGUIMIENTO_REGISTRAR',
        'NOTA_SENSIBLE_CONSULTAR',
        'JORNADA_CERRAR',
        'REPORTE_AGREGADO_CONSULTAR',
      ]),
    );
  });

  it('SUPERVISOR_CENTRAL solo ve reportes agregados', () => {
    expect(ROLE_PERMISSIONS.SUPERVISOR_CENTRAL).toEqual(['REPORTE_AGREGADO_CONSULTAR']);
  });

  it('ADMIN_CENTRAL administra usuarios, auditoría y reportes, sin datos de infantes', () => {
    expect(sorted(ROLE_PERMISSIONS.ADMIN_CENTRAL)).toEqual(
      sorted(['USUARIO_ADMINISTRAR', 'AUDITORIA_CONSULTAR', 'REPORTE_AGREGADO_CONSULTAR']),
    );
    expect(ROLE_PERMISSIONS.ADMIN_CENTRAL).not.toContain('ASISTENCIA_CONSULTAR');
    expect(ROLE_PERMISSIONS.ADMIN_CENTRAL).not.toContain('NOTA_SENSIBLE_CONSULTAR');
  });

  it('solo la directora administra el padrón y registra consentimientos', () => {
    for (const role of ROLE_CODES) {
      const expected = role === 'DIRECTORA';
      expect(ROLE_PERMISSIONS[role].includes('INFANTE_ADMINISTRAR')).toBe(expected);
      expect(ROLE_PERMISSIONS[role].includes('CONSENTIMIENTO_REGISTRAR')).toBe(expected);
    }
  });

  it('los roles centrales nunca consultan datos de infantes', () => {
    expect(ROLE_PERMISSIONS.ADMIN_CENTRAL).not.toContain('INFANTE_CONSULTAR');
    expect(ROLE_PERMISSIONS.SUPERVISOR_CENTRAL).not.toContain('INFANTE_CONSULTAR');
  });
});
