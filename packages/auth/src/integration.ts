/**
 * Alcances de los sistemas externos (RF-37). Son un catálogo aparte de los
 * permisos de las personas: un token de sistema nunca obtiene permisos de un
 * rol ni al revés. Cada ruta de integración declara el alcance que exige.
 */
export const INTEGRATION_SCOPES = ['REPORTE_AGREGADO_LEER'] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export const isIntegrationScope = (value: unknown): value is IntegrationScope =>
  typeof value === 'string' && (INTEGRATION_SCOPES as readonly string[]).includes(value);
