import { Inject, Injectable } from '@nestjs/common';
import type { Child, EnrollChildRequest, Room } from '@sirai/contracts';
import { ageInMonths, fitsRoomAge, roomHasSpace } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import type { ChildRecord, RoomRecord } from '../children.types';
import { CHILDREN_REPOSITORY, type ChildrenRepository } from '../repositories/children.repository';

const CHILDREN_TABLE = 'infantes';
const DATE_LENGTH = 10;

export const CLOCK = Symbol('CLOCK');
type Clock = () => Date;

const toRoomView = (room: RoomRecord): Room => ({
  id: room.id,
  estanciaId: room.estanciaId,
  name: room.name,
  shift: room.shift,
  minAgeMonths: room.minAgeMonths,
  maxAgeMonths: room.maxAgeMonths,
  capacity: room.capacity,
  status: room.status,
});

const toChildView = (child: ChildRecord): Child => ({
  id: child.id,
  enrollmentNumber: child.enrollmentNumber,
  name: child.name,
  paternalSurname: child.paternalSurname,
  maternalSurname: child.maternalSurname,
  birthDate: child.birthDate,
  hasDisability: child.hasDisability,
  status: child.status,
  roomId: child.roomId,
  roomName: child.roomName,
});

/**
 * Padrón de infantes de la estancia activa. Todo se acota a la estancia de
 * la sesión: una sala o infante de otra estancia se trata como inexistente.
 */
@Injectable()
export class ChildrenService {
  constructor(
    @Inject(CHILDREN_REPOSITORY) private readonly children: ChildrenRepository,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock = () => new Date(),
  ) {}

  async listRooms(auth: AuthContext): Promise<Room[]> {
    const rooms = await this.children.listActiveRooms(this.requireEstancia(auth));
    return rooms.map(toRoomView);
  }

  /** Consultar el padrón es una lectura de datos de menores: se audita. */
  async list(auth: AuthContext, request: RequestContext): Promise<Child[]> {
    const records = await this.children.listChildren(this.requireEstancia(auth));
    await this.audit.record({ ...this.actor(auth), action: 'INFANTES_CONSULTADOS', tableName: CHILDREN_TABLE, recordId: null, request });
    return records.map(toChildView);
  }

  /** Alta, inscripción inicial, movimiento y auditoría en una sola transacción. */
  async enroll(auth: AuthContext, input: EnrollChildRequest, request: RequestContext): Promise<Child> {
    const estanciaId = this.requireEstancia(auth);
    const now = this.clock();
    const room = await this.requireRoomFor(estanciaId, input);
    const schoolYearId = await this.children.findActiveSchoolYearId();
    if (schoolYearId === null) throw new ApiError('CONFLICTO', 'No hay un ciclo escolar activo.');
    const id = await this.children.registerChild(
      {
        enrollmentNumber: input.enrollmentNumber,
        curp: input.curp,
        name: input.name,
        paternalSurname: input.paternalSurname,
        maternalSurname: input.maternalSurname,
        birthDate: input.birthDate,
        gender: input.gender,
        hasDisability: input.hasDisability,
        disabilityGroupEncrypted: input.disabilityGroup === null ? null : this.encryption.encrypt(input.disabilityGroup),
      },
      { estanciaId, roomId: room.id, schoolYearId, startDate: now.toISOString().slice(0, DATE_LENGTH) },
      auth.userId,
      now,
      (tx, newId) =>
        this.audit.record(
          {
            ...this.actor(auth),
            action: 'INFANTE_REGISTRADO',
            tableName: CHILDREN_TABLE,
            recordId: String(newId),
            after: { enrollmentNumber: input.enrollmentNumber, roomId: room.id },
            request,
          },
          tx,
        ),
    );
    const created = await this.children.findChild(id, estanciaId);
    if (!created) throw new ApiError('NO_ENCONTRADO', 'Infante no encontrado.');
    return toChildView(created);
  }

  private async requireRoomFor(estanciaId: number, input: EnrollChildRequest): Promise<RoomRecord> {
    const room = await this.children.findRoom(input.roomId);
    if (room?.estanciaId !== estanciaId) throw new ApiError('NO_ENCONTRADO', 'Sala no encontrada.');
    if (room.status !== 'ACTIVO') throw new ApiError('CONFLICTO', 'La sala no está activa.');
    if (!roomHasSpace(room.capacity, await this.children.countActiveInRoom(room.id))) throw new ApiError('CONFLICTO', 'La sala está llena.');
    const months = ageInMonths(input.birthDate, this.clock().toISOString());
    if (!fitsRoomAge(months, { minMonths: room.minAgeMonths, maxMonths: room.maxAgeMonths })) {
      throw new ApiError('DATOS_INVALIDOS', 'La edad del infante está fuera del rango de la sala.');
    }
    return room;
  }

  private requireEstancia(auth: AuthContext): number {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia para continuar.');
    return auth.activeEstanciaId;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }
}
