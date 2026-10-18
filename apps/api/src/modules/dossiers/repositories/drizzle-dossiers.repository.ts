import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import { DB } from '../../../common/database/database.module.js';
import type { DossierRaw, IssuedDossier } from '../dossiers.types.js';
import type { DossiersRepository, IssueInput } from './dossiers.repository.js';

const {
  children, estancias, enrollments, enrollmentMovements, rooms, ciclosEscolares, childGuardians, guardians, consents,
  attendanceRecords, jornadasAsistencia, followUps, followUpContacts, medicalReleases, issuedDossiers,
} = schema;

/**
 * Lee todo lo del infante para el expediente. Son pocas consultas, cada una
 * acotada al infante; los datos sensibles se devuelven aún cifrados.
 */
@Injectable()
export class DrizzleDossiersRepository implements DossiersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async load(childId: number, estanciaId: number): Promise<DossierRaw | null> {
    const [child] = await this.db
      .select()
      .from(children)
      .innerJoin(enrollments, and(eq(enrollments.childId, children.id), eq(enrollments.estanciaId, estanciaId), eq(enrollments.status, 'ACTIVA'), isNull(enrollments.deletedAt)))
      .where(and(eq(children.id, childId), isNull(children.deletedAt)))
      .limit(1);
    const [estancia] = await this.db.select({ id: estancias.id, code: estancias.ebdiCode, name: estancias.name }).from(estancias).where(eq(estancias.id, estanciaId));
    if (!child || !estancia) return null;
    const row = child.infantes;
    return {
      child: {
        id: row.id,
        enrollmentNumber: row.enrollmentNumber,
        curp: row.curp,
        name: row.name,
        paternalSurname: row.paternalSurname,
        maternalSurname: row.maternalSurname,
        birthDate: row.birthDate,
        gender: row.gender,
        hasDisability: row.hasDisability,
        disabilityGroupEncrypted: row.disabilityGroupEncrypted,
        status: row.status,
      },
      estancia,
      enrollments: await this.enrollmentsOf(childId),
      movements: await this.movementsOf(childId),
      guardians: await this.guardiansOf(childId),
      consents: await this.consentsOf(childId),
      attendance: await this.attendanceOf(childId),
      followUps: await this.followUpsOf(childId),
    };
  }

  async issue(input: IssueInput, sealOf: (id: number) => Buffer, hook: (executor: AuditExecutor, id: number) => Promise<void>): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(issuedDossiers).values({
        childId: input.childId,
        estanciaId: input.estanciaId,
        issuedBy: input.userId,
        issuedAt: input.issuedAt,
        contentSha256: input.contentSha256,
        createdAt: input.issuedAt,
      });
      await tx.update(issuedDossiers).set({ seal: sealOf(created.insertId) }).where(eq(issuedDossiers.id, created.insertId));
      await hook(tx, created.insertId);
      return created.insertId;
    });
  }

  async findIssued(id: number): Promise<IssuedDossier | null> {
    const [row] = await this.db
      .select({ id: issuedDossiers.id, childId: issuedDossiers.childId, estanciaName: estancias.name, issuedAt: issuedDossiers.issuedAt, contentSha256: issuedDossiers.contentSha256, seal: issuedDossiers.seal })
      .from(issuedDossiers)
      .innerJoin(estancias, eq(estancias.id, issuedDossiers.estanciaId))
      .where(eq(issuedDossiers.id, id));
    return row ?? null;
  }

  private enrollmentsOf(childId: number): Promise<DossierRaw['enrollments']> {
    return this.db
      .select({ estanciaName: estancias.name, roomName: rooms.name, schoolYear: ciclosEscolares.code, startDate: enrollments.startDate, endDate: enrollments.endDate, status: enrollments.status })
      .from(enrollments)
      .innerJoin(estancias, eq(estancias.id, enrollments.estanciaId))
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .innerJoin(ciclosEscolares, eq(ciclosEscolares.id, enrollments.schoolYearId))
      .where(and(eq(enrollments.childId, childId), isNull(enrollments.deletedAt)))
      .orderBy(asc(enrollments.startDate), asc(enrollments.id));
  }

  private movementsOf(childId: number): Promise<DossierRaw['movements']> {
    return this.db
      .select({ type: enrollmentMovements.type, occurredAt: enrollmentMovements.occurredAt, reason: enrollmentMovements.reason })
      .from(enrollmentMovements)
      .innerJoin(enrollments, eq(enrollments.id, enrollmentMovements.enrollmentId))
      .where(eq(enrollments.childId, childId))
      .orderBy(asc(enrollmentMovements.occurredAt), asc(enrollmentMovements.id));
  }

  private guardiansOf(childId: number): Promise<DossierRaw['guardians']> {
    return this.db
      .select({
        name: guardians.name,
        paternalSurname: guardians.paternalSurname,
        maternalSurname: guardians.maternalSurname,
        relationship: childGuardians.relationship,
        isPrimary: childGuardians.isPrimary,
        canPickUp: childGuardians.canPickUp,
        isEmergencyContact: childGuardians.isEmergencyContact,
        validFrom: childGuardians.validFrom,
        validUntil: childGuardians.validUntil,
        phoneEncrypted: guardians.phoneEncrypted,
      })
      .from(childGuardians)
      .innerJoin(guardians, eq(guardians.id, childGuardians.guardianId))
      .where(and(eq(childGuardians.childId, childId), isNull(guardians.deletedAt), isNull(childGuardians.deletedAt)))
      .orderBy(asc(guardians.paternalSurname), asc(guardians.name));
  }

  private consentsOf(childId: number): Promise<DossierRaw['consents']> {
    return this.db
      .select({ type: consents.type, noticeVersion: consents.noticeVersion, accepted: consents.accepted, acceptedAt: consents.acceptedAt, revokedAt: consents.revokedAt })
      .from(consents)
      .where(eq(consents.childId, childId))
      .orderBy(asc(consents.acceptedAt), asc(consents.id));
  }

  private async attendanceOf(childId: number): Promise<DossierRaw['attendance']> {
    const rows = await this.db
      .select({ status: attendanceRecords.status, total: sql<number>`COUNT(*)` })
      .from(attendanceRecords)
      .innerJoin(enrollments, eq(enrollments.id, attendanceRecords.enrollmentId))
      .where(eq(enrollments.childId, childId))
      .groupBy(attendanceRecords.status)
      .orderBy(asc(attendanceRecords.status));
    return rows.map((row) => ({ status: row.status, total: Number(row.total) }));
  }

  private async followUpsOf(childId: number): Promise<DossierRaw['followUps']> {
    const tickets = await this.db
      .select({
        id: followUps.id,
        absenceDate: jornadasAsistencia.date,
        absenceStatus: attendanceRecords.status,
        status: followUps.status,
        cause: followUps.cause,
        expectedReturnDate: followUps.expectedReturnDate,
        requiresMedicalRelease: followUps.requiresMedicalRelease,
        openedAt: followUps.openedAt,
        closedAt: followUps.closedAt,
        releaseDate: medicalReleases.dischargeDate,
        releaseFolio: medicalReleases.folio,
        releaseObservations: medicalReleases.observationsEncrypted,
        releaseId: medicalReleases.id,
      })
      .from(followUps)
      .innerJoin(attendanceRecords, eq(attendanceRecords.id, followUps.attendanceRecordId))
      .innerJoin(jornadasAsistencia, eq(jornadasAsistencia.id, attendanceRecords.journeyId))
      .innerJoin(enrollments, eq(enrollments.id, attendanceRecords.enrollmentId))
      .leftJoin(medicalReleases, eq(medicalReleases.followUpId, followUps.id))
      .where(and(eq(enrollments.childId, childId), isNull(followUps.deletedAt)))
      .orderBy(asc(jornadasAsistencia.date), asc(followUps.id));
    if (tickets.length === 0) return [];
    const contacts = await this.db
      .select({
        followUpId: followUpContacts.followUpId,
        attemptNumber: followUpContacts.attemptNumber,
        occurredAt: followUpContacts.occurredAt,
        result: followUpContacts.result,
        guardianName: sql<string | null>`CONCAT_WS(' ', ${guardians.name}, ${guardians.paternalSurname})`,
        notesEncrypted: followUpContacts.notesEncrypted,
      })
      .from(followUpContacts)
      .leftJoin(guardians, eq(guardians.id, followUpContacts.guardianId))
      .where(and(inArray(followUpContacts.followUpId, tickets.map((ticket) => ticket.id)), isNull(followUpContacts.deletedAt)))
      .orderBy(asc(followUpContacts.attemptNumber));
    return tickets.map((ticket) => ({
      absenceDate: ticket.absenceDate,
      absenceStatus: ticket.absenceStatus,
      status: ticket.status,
      cause: ticket.cause,
      expectedReturnDate: ticket.expectedReturnDate,
      requiresMedicalRelease: ticket.requiresMedicalRelease,
      openedAt: ticket.openedAt,
      closedAt: ticket.closedAt,
      contacts: contacts
        .filter((contact) => contact.followUpId === ticket.id)
        .map((contact) => ({ attemptNumber: contact.attemptNumber, occurredAt: contact.occurredAt, result: contact.result, guardianName: contact.guardianName, notesEncrypted: contact.notesEncrypted })),
      release: ticket.releaseId === null ? null : { dischargeDate: ticket.releaseDate ?? '', folio: ticket.releaseFolio, observationsEncrypted: ticket.releaseObservations },
    }));
  }
}
