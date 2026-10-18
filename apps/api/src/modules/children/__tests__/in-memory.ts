import { ApiError } from '../../../common/errors/api-error';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type {
  ChildChanges,
  ChildGuardianRecord,
  ChildRecord,
  ConsentRecord,
  EnrollmentRecord,
  GuardianChanges,
  GuardianRecord,
  LinkChanges,
  MovementRecord,
  NewChild,
  NewChildGuardian,
  NewConsent,
  NewEnrollment,
  NewGuardian,
  PendingTransferRecord,
  RoomRecord,
  TransferDestinationRecord,
} from '../children.types';
import type { ChildrenRepository } from '../repositories/children.repository';
import type { ConsentsRepository } from '../repositories/consents.repository';
import type { EnrollmentsRepository } from '../repositories/enrollments.repository';
import type { GuardiansRepository } from '../repositories/guardians.repository';

export const room = (overrides: Partial<RoomRecord> = {}): RoomRecord => ({
  id: 1,
  estanciaId: 1,
  name: 'Lactantes A',
  shift: 'MATUTINO',
  minAgeMonths: 0,
  maxAgeMonths: 48,
  capacity: 15,
  status: 'ACTIVO',
  ...overrides,
});

export class InMemoryChildren implements ChildrenRepository {
  readonly rooms = new Map<number, RoomRecord>();
  readonly children = new Map<number, ChildRecord & { estanciaId: number; curp: string | null; disabilityGroupEncrypted: Buffer | null }>();
  readonly enrollments: NewEnrollment[] = [];
  schoolYearId: number | null = 1;
  private nextId = 1;

  listActiveRooms(estanciaId: number): Promise<RoomRecord[]> {
    return Promise.resolve([...this.rooms.values()].filter((r) => r.estanciaId === estanciaId && r.status === 'ACTIVO'));
  }

  findRoom(id: number): Promise<RoomRecord | null> {
    return Promise.resolve(this.rooms.get(id) ?? null);
  }

  countActiveInRoom(roomId: number): Promise<number> {
    return Promise.resolve([...this.children.values()].filter((child) => child.roomId === roomId).length);
  }

  findActiveSchoolYearId(): Promise<number | null> {
    return Promise.resolve(this.schoolYearId);
  }

  listChildren(estanciaId: number): Promise<ChildRecord[]> {
    return Promise.resolve([...this.children.values()].filter((c) => c.estanciaId === estanciaId));
  }

  findChild(id: number, estanciaId: number): Promise<ChildRecord | null> {
    const found = this.children.get(id);
    return Promise.resolve(found && found.estanciaId === estanciaId ? found : null);
  }

  /** Infantes con asistencia registrada, para probar que no se pueden eliminar. */
  readonly withAttendance = new Set<number>();
  readonly deleted: { id: number; userId: number }[] = [];

  async updateChild(id: number, changes: ChildChanges, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const current = this.children.get(id);
    if (!current) return;
    if (changes.curp && [...this.children.values()].some((c) => c.id !== id && c.curp === changes.curp)) {
      throw new ApiError('CONFLICTO', 'Ya existe un infante con esa matrícula o CURP.');
    }
    const { disabilityGroupEncrypted, ...rest } = changes;
    this.children.set(id, {
      ...current,
      ...rest,
      ...(disabilityGroupEncrypted === undefined ? {} : { disabilityGroupEncrypted }),
    });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  hasAttendance(childId: number): Promise<boolean> {
    return Promise.resolve(this.withAttendance.has(childId));
  }

  async softDeleteChild(id: number, userId: number, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    this.children.delete(id);
    this.deleted.push({ id, userId });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  async registerChild(
    child: NewChild,
    enrollment: NewEnrollment,
    _userId: number,
    _now: Date,
    inSameTransaction?: TransactionHook<number>,
  ): Promise<number> {
    const duplicated = [...this.children.values()].some(
      (c) => c.enrollmentNumber === child.enrollmentNumber || (child.curp !== null && c.curp === child.curp),
    );
    if (duplicated) throw new ApiError('CONFLICTO', 'Ya existe un infante con esa matrícula o CURP.');
    const id = this.nextId++;
    const roomName = this.rooms.get(enrollment.roomId)?.name ?? '';
    this.children.set(id, {
      id,
      enrollmentNumber: child.enrollmentNumber,
      name: child.name,
      paternalSurname: child.paternalSurname,
      maternalSurname: child.maternalSurname,
      birthDate: child.birthDate,
      hasDisability: child.hasDisability,
      status: 'ACTIVO',
      roomId: enrollment.roomId,
      roomName,
      estanciaId: enrollment.estanciaId,
      curp: child.curp,
      disabilityGroupEncrypted: child.disabilityGroupEncrypted,
    });
    this.enrollments.push(enrollment);
    await inSameTransaction?.({} as Parameters<TransactionHook<number>>[0], id);
    return id;
  }
}


type StoredGuardian = GuardianRecord & { phoneEncrypted: Buffer | null; phoneHash: Buffer | null };

export class InMemoryGuardians implements GuardiansRepository {
  readonly rows = new Map<number, StoredGuardian>();
  readonly links: { childId: number; link: NewChildGuardian }[] = [];
  private nextId = 1;

  constructor(private readonly children: InMemoryChildren) {}

  async create(guardian: NewGuardian, _now: Date, inSameTransaction?: TransactionHook<number>): Promise<number> {
    const id = this.nextId++;
    this.rows.set(id, {
      id,
      name: guardian.name,
      paternalSurname: guardian.paternalSurname,
      maternalSurname: guardian.maternalSurname,
      hasPhone: true,
      phoneEncrypted: guardian.phoneEncrypted,
      phoneHash: guardian.phoneHash,
    });
    await inSameTransaction?.({} as Parameters<TransactionHook<number>>[0], id);
    return id;
  }

  findById(id: number): Promise<GuardianRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  async update(id: number, changes: GuardianChanges, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const current = this.rows.get(id);
    if (current) this.rows.set(id, { ...current, ...changes, hasPhone: true });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  async updateLink(childId: number, guardianId: number, changes: LinkChanges, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const entry = this.links.find((item) => item.childId === childId && item.link.guardianId === guardianId);
    if (entry) entry.link = { ...entry.link, ...changes };
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  readonly deletedLinks: { childId: number; guardianId: number; userId: number }[] = [];

  async softDeleteLink(childId: number, guardianId: number, userId: number, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const index = this.links.findIndex((item) => item.childId === childId && item.link.guardianId === guardianId);
    if (index >= 0) this.links.splice(index, 1);
    this.deletedLinks.push({ childId, guardianId, userId });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  listForChild(childId: number): Promise<ChildGuardianRecord[]> {
    const today = new Date().toISOString().slice(0, 10);
    return Promise.resolve(
      this.links
        .filter((entry) => entry.childId === childId && (entry.link.validUntil === null || entry.link.validUntil >= today))
        .map(({ link }) => {
          const guardian = this.rows.get(link.guardianId) as StoredGuardian;
          const { phoneEncrypted: _phone, phoneHash: _hash, ...view } = guardian;
          return { ...view, ...link };
        }),
    );
  }

  async link(childId: number, link: NewChildGuardian, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    if (this.links.some((entry) => entry.childId === childId && entry.link.guardianId === link.guardianId)) {
      throw new ApiError('CONFLICTO', 'El tutor ya está vinculado a este infante.');
    }
    this.links.push({ childId, link });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  isLinkedInEstancia(guardianId: number, estanciaId: number): Promise<boolean> {
    return Promise.resolve(
      this.links.some((entry) => entry.link.guardianId === guardianId && this.children.children.get(entry.childId)?.estanciaId === estanciaId),
    );
  }

  findPhoneEncrypted(guardianId: number): Promise<Buffer | null> {
    return Promise.resolve(this.rows.get(guardianId)?.phoneEncrypted ?? null);
  }
}

export class InMemoryConsents implements ConsentsRepository {
  readonly rows = new Map<number, ConsentRecord>();
  private nextId = 1;

  listForChild(childId: number): Promise<ConsentRecord[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.childId === childId));
  }

  findById(id: number): Promise<ConsentRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  async create(consent: NewConsent, now: Date, userId: number, inSameTransaction?: TransactionHook<number>): Promise<number> {
    const id = this.nextId++;
    this.rows.set(id, { id, ...consent, acceptedAt: now, revokedAt: null, registeredBy: userId });
    await inSameTransaction?.({} as Parameters<TransactionHook<number>>[0], id);
    return id;
  }

  async revoke(id: number, at: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, revokedAt: at });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }
}

/** Inscripciones y traslados en memoria, apoyados en el padrón de InMemoryChildren. */
export class InMemoryEnrollments implements EnrollmentsRepository {
  readonly movements: MovementRecord[] = [];
  readonly estancias = new Map<number, { code: string; name: string; active: boolean }>();
  readonly finished: { childId: number; status: string }[] = [];
  readonly pending: PendingTransferRecord[] = [];
  private readonly enrollmentIds = new Map<number, number>();

  constructor(private readonly children: InMemoryChildren) {}

  private idFor(childId: number): number {
    if (!this.enrollmentIds.has(childId)) this.enrollmentIds.set(childId, 100 + childId);
    return this.enrollmentIds.get(childId) as number;
  }

  findActive(childId: number, estanciaId: number): Promise<EnrollmentRecord | null> {
    const child = this.children.children.get(childId);
    if (!child || child.estanciaId !== estanciaId) return Promise.resolve(null);
    return Promise.resolve({ id: this.idFor(childId), childId, estanciaId, roomId: child.roomId, schoolYearId: 1, status: 'ACTIVA' });
  }

  listTransferDestinations(exceptEstanciaId: number): Promise<TransferDestinationRecord[]> {
    return Promise.resolve([...this.estancias.entries()].filter(([id, e]) => id !== exceptEstanciaId && e.active).map(([id, e]) => ({ id, code: e.code, name: e.name })));
  }

  isEstanciaActive(id: number): Promise<boolean> {
    return Promise.resolve(this.estancias.get(id)?.active ?? false);
  }

  async changeRoom(enrollment: EnrollmentRecord, movement: MovementRecord, _userId: number, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const child = this.children.children.get(enrollment.childId);
    if (child) this.children.children.set(child.id, { ...child, roomId: movement.newRoomId as number, roomName: this.children.rooms.get(movement.newRoomId as number)?.name ?? '' });
    this.movements.push(movement);
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  async finish(enrollment: EnrollmentRecord, status: 'BAJA' | 'TRASLADADA', movement: MovementRecord, _userId: number, _now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    this.children.children.delete(enrollment.childId);
    this.finished.push({ childId: enrollment.childId, status });
    this.movements.push(movement);
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }

  listPendingTransfers(toEstanciaId: number): Promise<PendingTransferRecord[]> {
    return Promise.resolve(this.pending.filter((t) => this.destinationOf.get(t.enrollmentId) === toEstanciaId));
  }

  readonly destinationOf = new Map<number, number>();

  async findPendingTransfer(enrollmentId: number, toEstanciaId: number): Promise<PendingTransferRecord | null> {
    return (await this.listPendingTransfers(toEstanciaId)).find((t) => t.enrollmentId === enrollmentId) ?? null;
  }

  async receiveTransfer(
    transfer: PendingTransferRecord,
    destination: { estanciaId: number; roomId: number; schoolYearId: number },
    _userId: number,
    _now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void> {
    this.pending.splice(this.pending.indexOf(transfer), 1);
    this.movements.push({ type: 'ALTA', previousEstanciaId: transfer.fromEstanciaId, newEstanciaId: destination.estanciaId, previousRoomId: null, newRoomId: destination.roomId, reason: transfer.reason });
    await inSameTransaction?.({} as Parameters<TransactionHook<void>>[0], undefined);
  }
}
