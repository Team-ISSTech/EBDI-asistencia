import type { DayRecord, IncidentType, PickupLink } from '@sirai/domain';

/** El registro de asistencia de un infante en una jornada. */
export interface DayRecordRow extends DayRecord {
  readonly id: number;
}

/** Un tutor vinculado al infante, con lo necesario para decidir si puede recogerlo. */
export interface PickupLinkRow extends PickupLink {
  readonly guardianId: number;
  readonly name: string;
  readonly relationship: string;
}

export interface IncidentRow {
  readonly id: number;
  readonly type: IncidentType;
  readonly descriptionEncrypted: Buffer | null;
  readonly createdAt: Date;
}

export interface NewDeparture {
  readonly recordId: number;
  readonly guardianId: number;
  readonly userId: number;
  readonly at: Date;
}

export interface NewIncident {
  readonly recordId: number;
  readonly type: IncidentType;
  readonly descriptionEncrypted: Buffer;
  readonly userId: number;
  readonly at: Date;
}
