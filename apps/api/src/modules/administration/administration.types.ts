import type { EstanciaStatus, RoomStatus, Shift } from '@sirai/domain';

export interface EstanciaRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly ur: string | null;
  readonly region: string | null;
  readonly address: string | null;
  readonly timeZone: string;
  readonly status: EstanciaStatus;
}

export interface NewEstancia {
  readonly code: string;
  readonly name: string;
  readonly ur: string | null;
  readonly region: string | null;
  readonly address: string | null;
  readonly timeZone: string;
}

export type EstanciaChanges = Partial<Omit<EstanciaRecord, 'id' | 'code'>>;

export interface AdminRoomRecord {
  readonly id: number;
  readonly estanciaId: number;
  readonly name: string;
  readonly shift: Shift;
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly capacity: number | null;
  readonly status: RoomStatus;
  /** Infantes con inscripción activa en la sala. */
  readonly enrolled: number;
}

export interface NewRoom {
  readonly estanciaId: number;
  readonly name: string;
  readonly shift: Shift;
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly capacity: number | null;
}

export type RoomChanges = Partial<Pick<AdminRoomRecord, 'name' | 'shift' | 'minAgeMonths' | 'maxAgeMonths' | 'capacity' | 'status'>>;
