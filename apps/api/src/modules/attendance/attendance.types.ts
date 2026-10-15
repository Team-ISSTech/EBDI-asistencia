import type { JourneyStatus, Shift } from '@sirai/domain';

export interface AttendanceJourneyRecord {
  readonly id: number;
  readonly estanciaId: number;
  readonly date: string;
  readonly shift: Shift;
  readonly status: JourneyStatus;
  readonly openedAt: Date;
  readonly openedBy: number;
  readonly closedAt: Date | null;
  readonly closedBy: number | null;
}
