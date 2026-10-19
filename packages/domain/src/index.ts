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
  CONTACT_CAUSES,
  CONTACT_RESULTS,
  EMERGENCY_ALERT_AFTER_ATTEMPTS,
  FOLLOW_UP_CAUSES,
  FOLLOW_UP_STATUSES,
  SECOND_ATTEMPT_DELAY_HOURS,
  applyContact,
  canClose,
  canRegisterRelease,
  cutoffReached,
  generatesFollowUp,
  isEmergencyAlert,
  isMedicalLockActive,
  requiresMedicalRelease,
  secondAttemptDueAt,
} from './follow-up.js';
export type {
  CloseCheck,
  CloseState,
  ContactInput,
  ContactOutcome,
  ContactResult,
  FollowUpAfterContact,
  FollowUpCause,
  FollowUpState,
  FollowUpStatus,
  ReleaseCheck,
  TicketLockState,
} from './follow-up.js';
export { GREEN_FROM, REPORT_PERIODS, TRAFFIC_LIGHTS, YELLOW_FROM, attendanceRate, dossierFolio, parseDossierFolio, periodRange, trafficLight } from './reports.js';
export type { DateRange, ReportPeriod, TrafficLight } from './reports.js';
export {
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  SYNC_ENTITIES,
  SYNC_OPERATION_TYPES,
  SYNC_RESULT_STATUSES,
  isTransientFailure,
  nextRetryDelayMs,
} from './sync.js';
export type { SyncOperationType, SyncResultStatus } from './sync.js';
export { canChangeRoomShift, canRetireEstancia, canRetireRoom, isValidTimeZone, roomCapacityAllows, roomHasSpace } from './catalog-rules.js';
export type { EstanciaUsage, RetireEstanciaCheck } from './catalog-rules.js';
export {
  checkNewPassword,
  isTemporaryPasswordExpired,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  temporaryPasswordExpiry,
} from './password-policy.js';
export type { PasswordCheck } from './password-policy.js';
export { changedFieldNames } from './audit-fields.js';
export {
  canArchiveSchoolYear,
  canPurgeSchoolYear,
  isPurgeEligible,
  purgeEligibleOn,
  RETENTION_YEARS,
} from './school-year.js';
export type { ArchiveCheck, PurgeCheck, SchoolYearLifecycle, SchoolYearUsage } from './school-year.js';
export { EMERGENCY_NOTICE_STATUSES, EMERGENCY_NOTICE_TEXT, MAX_NOTICE_ATTEMPTS, afterFailedNotice } from './emergency-notice.js';
export type { EmergencyNoticeStatus, NoticeRetry } from './emergency-notice.js';
