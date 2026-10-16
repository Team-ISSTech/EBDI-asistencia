import type { BadgeTone } from '@sirai/ui';
import type { TrafficLight } from '@sirai/domain';

/** El color siempre va acompañado de su nombre: no se depende solo del tono. */
export const LIGHT_LABELS: Readonly<Record<TrafficLight, string>> = {
  VERDE: 'Verde',
  AMARILLO: 'Amarillo',
  ROJO: 'Rojo',
  SIN_CAPTURA: 'Sin captura',
};

export const LIGHT_TONES: Readonly<Record<TrafficLight, BadgeTone>> = {
  VERDE: 'success',
  AMARILLO: 'accent',
  ROJO: 'danger',
  SIN_CAPTURA: 'neutral',
};

export const formatRate = (rate: number | null): string => (rate === null ? '—' : `${Math.round(rate * 100)} %`);
