import type { ChildStatus, RoomStatus, Shift } from '@sirai/domain';

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
