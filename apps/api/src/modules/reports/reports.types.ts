/** Hechos crudos de una estancia ese día; el servicio deriva pendientes, tasa y color. */
export interface EstanciaFacts {
  readonly estanciaId: number;
  readonly code: string;
  readonly name: string;
  readonly region: string | null;
  /** ¿Se abrió alguna jornada ese día? Sin jornada no hay captura. */
  readonly hasJourney: boolean;
  readonly enrolled: number;
  readonly present: number;
  readonly absent: number;
  readonly other: number;
}

/** A qué estancias puede acceder quien consulta un reporte. */
export type ReportScope =
  | { readonly kind: 'ALL' }
  | { readonly kind: 'LIMITED'; readonly regions: readonly string[]; readonly estanciaIds: readonly number[] };
