import type { ChildStatus, ConsentType, EnrollmentMovement, EnrollmentStatus, RoomStatus, Shift } from '@sirai/domain';

export interface RoomRecord {
  readonly id: number;
  readonly estanciaId: number;
  readonly name: string;
  readonly shift: Shift;
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly capacity: number | null;
  readonly status: RoomStatus;
}

/** Infante con su inscripción activa en la estancia; sin datos cifrados. */
export interface ChildRecord {
  readonly id: number;
  readonly enrollmentNumber: string;
  readonly name: string;
  readonly paternalSurname: string;
  readonly maternalSurname: string | null;
  readonly birthDate: string;
  readonly hasDisability: boolean;
  readonly status: ChildStatus;
  readonly roomId: number;
  readonly roomName: string;
}

export interface NewChild {
  readonly enrollmentNumber: string;
  readonly curp: string | null;
  readonly name: string;
  readonly paternalSurname: string;
  readonly maternalSurname: string | null;
  readonly birthDate: string;
  readonly gender: string | null;
  readonly hasDisability: boolean;
  /** Ya cifrado por el servicio: el repositorio nunca ve el texto claro. */
  readonly disabilityGroupEncrypted: Buffer | null;
}

/** Cambios ya listos para guardar: lo sensible llega cifrado y lo que no viene no se toca. */
export interface ChildChanges {
  readonly curp?: string | null;
  readonly name?: string;
  readonly paternalSurname?: string;
  readonly maternalSurname?: string | null;
  readonly birthDate?: string;
  readonly gender?: string | null;
  readonly hasDisability?: boolean;
  readonly disabilityGroupEncrypted?: Buffer | null;
}

export interface GuardianChanges {
  readonly name?: string;
  readonly paternalSurname?: string;
  readonly maternalSurname?: string | null;
  readonly idType?: string | null;
  readonly idFolio?: string | null;
  readonly email?: string | null;
  readonly phoneEncrypted?: Buffer;
  readonly phoneHash?: Buffer;
}

export interface LinkChanges {
  readonly relationship?: string;
  readonly isPrimary?: boolean;
  readonly canPickUp?: boolean;
  readonly isEmergencyContact?: boolean;
  readonly validUntil?: string | null;
}

export interface NewEnrollment {
  readonly estanciaId: number;
  readonly roomId: number;
  readonly schoolYearId: number;
  readonly startDate: string;
}

export interface NewGuardian {
  readonly name: string;
  readonly paternalSurname: string;
  readonly maternalSurname: string | null;
  readonly idType: string | null;
  readonly idFolio: string | null;
  /** Ya cifrado por el servicio. */
  readonly phoneEncrypted: Buffer;
  /** HMAC del teléfono, para buscar sin descifrar. */
  readonly phoneHash: Buffer;
  readonly email: string | null;
}

export interface GuardianRecord {
  readonly id: number;
  readonly name: string;
  readonly paternalSurname: string;
  readonly maternalSurname: string | null;
  readonly hasPhone: boolean;
}

export interface NewChildGuardian {
  readonly guardianId: number;
  readonly relationship: string;
  readonly isPrimary: boolean;
  readonly canPickUp: boolean;
  readonly isEmergencyContact: boolean;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

/** Tutor visto desde un infante: datos del tutor más su vínculo. */
export interface ChildGuardianRecord extends GuardianRecord, Omit<NewChildGuardian, 'guardianId'> {}

export interface NewConsent {
  readonly childId: number;
  readonly guardianId: number;
  readonly type: ConsentType;
  readonly noticeVersion: string;
  readonly accepted: boolean;
}

export interface ConsentRecord extends NewConsent {
  readonly id: number;
  readonly acceptedAt: Date;
  readonly revokedAt: Date | null;
  readonly registeredBy: number;
}

/** Inscripción tal como la necesitan los movimientos. */
export interface EnrollmentRecord {
  readonly id: number;
  readonly childId: number;
  readonly estanciaId: number;
  readonly roomId: number;
  readonly schoolYearId: number;
  readonly status: EnrollmentStatus;
}

export interface MovementRecord {
  readonly type: EnrollmentMovement;
  readonly previousEstanciaId: number | null;
  readonly newEstanciaId: number | null;
  readonly previousRoomId: number | null;
  readonly newRoomId: number | null;
  readonly reason: string | null;
}

/** Traslado que la estancia de destino aún no recibe. */
export interface PendingTransferRecord {
  readonly enrollmentId: number;
  readonly childId: number;
  readonly childName: string;
  readonly enrollmentNumber: string;
  readonly birthDate: string;
  readonly fromEstanciaId: number;
  readonly fromEstanciaName: string;
  readonly movedAt: Date;
  readonly reason: string | null;
}

export interface TransferDestinationRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
}
