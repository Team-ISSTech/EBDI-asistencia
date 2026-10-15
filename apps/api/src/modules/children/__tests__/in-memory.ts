import { ApiError } from '../../../common/errors/api-error';
import type { TransactionHook } from '../../identity/repositories/repositories';
import type { ChildRecord, NewChild, NewEnrollment, RoomRecord } from '../children.types';
import type { ChildrenRepository } from '../repositories/children.repository';

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
