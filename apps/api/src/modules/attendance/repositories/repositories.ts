import type { Shift } from '@sirai/domain';
import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { AttendanceJourneyRecord } from '../attendance.types.js';

export type JourneyTransactionHook<T> = (executor: AuditExecutor, result: T) => Promise<void>;

export interface AttendanceJourneysRepository {
  findById(id: number, estanciaId: number): Promise<AttendanceJourneyRecord | null>;
  findByKey(estanciaId: number, date: string, shift: Shift): Promise<AttendanceJourneyRecord | null>;
  create(
    input: Omit<AttendanceJourneyRecord, 'id' | 'status' | 'closedAt' | 'closedBy' | 'schoolYearArchived'>,
    hook?: JourneyTransactionHook<number>,
  ): Promise<AttendanceJourneyRecord>;
  close(
    id: number,
    estanciaId: number,
    closedBy: number,
    closedAt: Date,
    hook?: JourneyTransactionHook<void>,
  ): Promise<AttendanceJourneyRecord | null>;
}

export const ATTENDANCE_JOURNEYS_REPOSITORY = Symbol('ATTENDANCE_JOURNEYS_REPOSITORY');
