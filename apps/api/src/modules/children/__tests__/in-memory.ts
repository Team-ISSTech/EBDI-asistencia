import { ApiError } from '../../../common/errors/api-error';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type {
  ChildGuardianRecord,
  ChildRecord,
  GuardianRecord,
  NewChild,
  NewChildGuardian,
  NewEnrollment,
  NewGuardian,
  RoomRecord,
} from '../children.types';
import type { ChildrenRepository } from '../repositories/children.repository';
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

  listForChild(childId: number): Promise<ChildGuardianRecord[]> {
    return Promise.resolve(
      this.links
        .filter((entry) => entry.childId === childId)
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
