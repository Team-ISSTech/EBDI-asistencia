/** Filtros ya validados de la consulta de auditoría. */
export interface AuditFilters {
  readonly from?: Date;
  readonly to?: Date;
  readonly userId?: number;
  readonly action?: string;
  readonly table?: string;
  readonly recordId?: string;
  readonly beforeId?: number;
}

/** Renglón de la bitácora tal como está guardado: los cambios siguen cifrados. */
export interface AuditRow {
  readonly id: number;
  readonly occurredAt: Date;
  readonly userId: number | null;
  readonly userName: string | null;
  readonly systemName: string | null;
  readonly roleCode: string | null;
  readonly action: string;
  readonly tableName: string;
  readonly recordId: string | null;
  readonly ipAddress: Buffer | null;
  readonly userAgent: string | null;
  readonly previousDataEncrypted: Buffer | null;
  readonly newDataEncrypted: Buffer | null;
}

export interface AuditFacets {
  readonly actions: string[];
  readonly tables: string[];
}
