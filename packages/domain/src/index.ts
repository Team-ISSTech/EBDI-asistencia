export {
  CHILD_STATUSES,
  ENROLLMENT_MOVEMENTS,
  ENROLLMENT_STATUSES,
  ESTANCIA_STATUSES,
  GUARDIAN_STATUSES,
  ROOM_STATUSES,
} from './catalogs.js';
export type {
  ChildStatus,
  EnrollmentMovement,
  EnrollmentStatus,
  EstanciaStatus,
  GuardianStatus,
  RoomStatus,
} from './catalogs.js';
export { ageInMonths, fitsRoomAge, nextEnrollmentStatus } from './enrollment.js';
export type { EnrollmentTransition, RoomAgeRange } from './enrollment.js';
export { CONSENT_STATUSES, CONSENT_TYPES, canRevoke, currentConsentStatus, isConsentType } from './consent.js';
export type { ConsentFact, ConsentStatus, ConsentType } from './consent.js';
export * from './attendance.js';
export { ATTENDANCE_METHODS, planMark } from './marking.js';
export type { AttendanceMethod, MarkPlan } from './marking.js';
export {
  ABSENCE_CUTOFF_HOUR,
  ABSENCE_STATUSES,
  FOLLOW_UP_CAUSES,
  FOLLOW_UP_STATUSES,
  SECOND_ATTEMPT_DELAY_HOURS,
  cutoffReached,
  generatesFollowUp,
  requiresMedicalRelease,
  secondAttemptDueAt,
} from './follow-up.js';
export type { FollowUpCause, FollowUpStatus } from './follow-up.js';
