/**
 * Fecha de calendario sin hora («2026-08-24») en formato local. Se lee y se escribe en UTC para que el día no cambie
 * con la zona horaria del equipo: `new Date('2026-08-24')` es medianoche UTC, que en Ciudad de México aún es el 23.
 */
export const formatIsoDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('es-MX', { timeZone: 'UTC' });
