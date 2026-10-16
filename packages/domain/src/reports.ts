export const TRAFFIC_LIGHTS = ['VERDE', 'AMARILLO', 'ROJO', 'SIN_CAPTURA'] as const;
export type TrafficLight = (typeof TRAFFIC_LIGHTS)[number];

/**
 * Umbrales del semáforo (RF-16). El SRS no los define: se asumen 90 % y 75 %
 * y deben confirmarse con el cliente (supuesto S-15).
 */
export const GREEN_FROM = 0.9;
export const YELLOW_FROM = 0.75;

/** Proporción de presentes entre los esperados; nula si no hay esperados. */
export function attendanceRate(present: number, expected: number): number | null {
  if (expected <= 0) return null;
  return Math.min(1, present / expected);
}

/** Color del semáforo; sin tasa (sin jornada o sin inscritos) queda SIN_CAPTURA. */
export function trafficLight(rate: number | null): TrafficLight {
  if (rate === null) return 'SIN_CAPTURA';
  if (rate >= GREEN_FROM) return 'VERDE';
  return rate >= YELLOW_FROM ? 'AMARILLO' : 'ROJO';
}
