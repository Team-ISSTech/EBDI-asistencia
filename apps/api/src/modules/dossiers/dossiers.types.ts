/** Datos tal como salen de la base: los campos sensibles siguen cifrados. */
export interface DossierRaw {
  readonly child: {
    readonly id: number;
    readonly enrollmentNumber: string;
    readonly curp: string | null;
    readonly name: string;
    readonly paternalSurname: string;
    readonly maternalSurname: string | null;
    readonly birthDate: string;
    readonly gender: string | null;
    readonly hasDisability: boolean;
    readonly disabilityGroupEncrypted: Buffer | null;
    readonly status: string;
  };
  readonly estancia: { readonly id: number; readonly code: string; readonly name: string };
  readonly enrollments: readonly {
    readonly estanciaName: string;
    readonly roomName: string;
    readonly schoolYear: string;
    readonly startDate: string;
    readonly endDate: string | null;
    readonly status: string;
  }[];
  readonly movements: readonly { readonly type: string; readonly occurredAt: Date; readonly reason: string | null }[];
  readonly guardians: readonly {
    readonly name: string;
    readonly paternalSurname: string;
    readonly maternalSurname: string | null;
    readonly relationship: string;
    readonly isPrimary: boolean;
    readonly canPickUp: boolean;
    readonly isEmergencyContact: boolean;
    readonly validFrom: string;
    readonly validUntil: string | null;
    readonly phoneEncrypted: Buffer | null;
  }[];
  readonly consents: readonly {
    readonly type: string;
    readonly noticeVersion: string;
    readonly accepted: boolean;
    readonly acceptedAt: Date;
    readonly revokedAt: Date | null;
  }[];
  readonly attendance: readonly { readonly status: string; readonly total: number }[];
  readonly followUps: readonly {
    readonly absenceDate: string;
    readonly absenceStatus: string;
    readonly status: string;
    readonly cause: string | null;
    readonly expectedReturnDate: string | null;
    readonly requiresMedicalRelease: boolean;
    readonly openedAt: Date;
    readonly closedAt: Date | null;
    readonly contacts: readonly {
      readonly attemptNumber: number;
      readonly occurredAt: Date;
      readonly result: string;
      readonly guardianName: string | null;
      readonly notesEncrypted: Buffer | null;
    }[];
    readonly release: { readonly dischargeDate: string; readonly folio: string | null; readonly observationsEncrypted: Buffer | null } | null;
  }[];
}

/** El mismo contenido ya descifrado y con fechas en texto: lo que se imprime y se sella. */
export interface DossierDocument {
  readonly child: {
    readonly enrollmentNumber: string;
    readonly curp: string | null;
    readonly fullName: string;
    readonly birthDate: string;
    readonly gender: string | null;
    readonly hasDisability: boolean;
    readonly disabilityGroup: string | null;
    readonly status: string;
  };
  readonly estancia: { readonly code: string; readonly name: string };
  readonly enrollments: DossierRaw['enrollments'];
  readonly movements: readonly { readonly type: string; readonly occurredAt: string; readonly reason: string | null }[];
  readonly guardians: readonly {
    readonly fullName: string;
    readonly relationship: string;
    readonly isPrimary: boolean;
    readonly canPickUp: boolean;
    readonly isEmergencyContact: boolean;
    readonly validFrom: string;
    readonly validUntil: string | null;
    readonly phone: string | null;
  }[];
  readonly consents: readonly {
    readonly type: string;
    readonly noticeVersion: string;
    readonly accepted: boolean;
    readonly acceptedAt: string;
    readonly revokedAt: string | null;
  }[];
  readonly attendance: DossierRaw['attendance'];
  readonly followUps: readonly {
    readonly absenceDate: string;
    readonly absenceStatus: string;
    readonly status: string;
    readonly cause: string | null;
    readonly expectedReturnDate: string | null;
    readonly requiresMedicalRelease: boolean;
    readonly openedAt: string;
    readonly closedAt: string | null;
    readonly contacts: readonly { readonly attemptNumber: number; readonly occurredAt: string; readonly result: string; readonly guardianName: string | null; readonly notes: string | null }[];
    readonly release: { readonly dischargeDate: string; readonly folio: string | null; readonly observations: string | null } | null;
  }[];
}

export interface IssuedDossier {
  readonly id: number;
  readonly childId: number;
  readonly estanciaName: string;
  readonly issuedAt: Date;
  readonly contentSha256: Buffer;
  readonly seal: Buffer | null;
}
