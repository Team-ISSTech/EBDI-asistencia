import { Inject, Injectable } from '@nestjs/common';
import type { CreateRoomRequest, RoomAdmin, UpdateRoomRequest } from '@sirai/contracts';
import { canChangeRoomShift, canRetireRoom, roomCapacityAllows } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import type { AdminRoomRecord, RoomChanges } from '../administration.types';
import { ROOMS_ADMIN_REPOSITORY, type RoomsAdminRepository } from '../repositories/rooms-admin.repository';
import { ADMIN_CLOCK } from './estancias-admin.service';

const ROOMS_TABLE = 'salas_grupos';

const toView = (record: AdminRoomRecord): RoomAdmin => ({ ...record });

const diff = (current: AdminRoomRecord, changes: RoomChanges): { before: Record<string, unknown>; after: Record<string, unknown>; changed: RoomChanges } => {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(changes) as Array<keyof RoomChanges>) {
    const value = changes[key];
    if (value !== undefined && current[key] !== value) {
      before[key] = current[key];
      after[key] = value;
    }
  }
  return { before, after, changed: after };
};

/**
 * Catálogo de salas y grupos de la estancia activa (RF-32), a cargo de la
 * directora. Una sala con infantes inscritos no cambia de turno, no baja su
 * capacidad por debajo de ellos y no se desactiva ni se da de baja.
 */
@Injectable()
export class RoomsAdminService {
  constructor(
    @Inject(ROOMS_ADMIN_REPOSITORY) private readonly rooms: RoomsAdminRepository,
    private readonly audit: AuditService,
    @Inject(ADMIN_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(auth: AuthContext): Promise<RoomAdmin[]> {
    return (await this.rooms.list(this.requireEstancia(auth))).map(toView);
  }

  async create(auth: AuthContext, input: CreateRoomRequest, request: RequestContext): Promise<RoomAdmin> {
    const estanciaId = this.requireEstancia(auth);
    const id = await this.rooms.create({ estanciaId, ...input }, this.clock(), (tx, newId) =>
      this.audit.record({ ...this.actor(auth), action: 'SALA_CREADA', tableName: ROOMS_TABLE, recordId: String(newId), after: input, request }, tx),
    );
    return toView(await this.require(id, estanciaId));
  }

  async update(auth: AuthContext, id: number, input: UpdateRoomRequest, request: RequestContext): Promise<RoomAdmin> {
    const current = await this.require(id, this.requireEstancia(auth));
    this.assertCoherent(current, input);
    const { before, after, changed } = diff(current, input);
    if (Object.keys(changed).length === 0) return toView(current);
    this.assertAllowed(current, changed);
    await this.rooms.update(id, changed, this.clock(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'SALA_ACTUALIZADA', tableName: ROOMS_TABLE, recordId: String(id), before, after, request }, tx),
    );
    return toView(await this.require(id, current.estanciaId));
  }

  /** Baja lógica: la sala deja de aparecer, pero su historial de inscripciones se conserva. */
  async retire(auth: AuthContext, id: number, request: RequestContext): Promise<void> {
    const current = await this.require(id, this.requireEstancia(auth));
    if (!canRetireRoom(current.enrolled)) throw new ApiError('CONFLICTO', 'La sala tiene infantes inscritos: muévelos antes de darla de baja.');
    await this.rooms.retire(id, auth.userId, this.clock(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'SALA_DADA_DE_BAJA', tableName: ROOMS_TABLE, recordId: String(id), before: { name: current.name, shift: current.shift }, request }, tx),
    );
  }

  /** El rango de edad resultante de un cambio parcial debe seguir siendo coherente. */
  private assertCoherent(current: AdminRoomRecord, input: UpdateRoomRequest): void {
    const min = input.minAgeMonths === undefined ? current.minAgeMonths : input.minAgeMonths;
    const max = input.maxAgeMonths === undefined ? current.maxAgeMonths : input.maxAgeMonths;
    if (min !== null && max !== null && min > max) throw new ApiError('DATOS_INVALIDOS', 'La edad mínima no puede ser mayor que la máxima.');
  }

  private assertAllowed(current: AdminRoomRecord, changed: RoomChanges): void {
    if (changed.shift !== undefined && !canChangeRoomShift(current.enrolled)) {
      throw new ApiError('CONFLICTO', 'La sala tiene infantes inscritos: no se puede cambiar su turno.');
    }
    if (changed.capacity !== undefined && !roomCapacityAllows(changed.capacity, current.enrolled)) {
      throw new ApiError('CONFLICTO', `La capacidad no puede ser menor que los ${current.enrolled} infantes inscritos.`);
    }
    if (changed.status === 'INACTIVO' && !canRetireRoom(current.enrolled)) {
      throw new ApiError('CONFLICTO', 'La sala tiene infantes inscritos: no se puede desactivar.');
    }
  }

  /** Una sala de otra estancia se trata como inexistente. */
  private async require(id: number, estanciaId: number): Promise<AdminRoomRecord> {
    const room = await this.rooms.findById(id);
    if (room?.estanciaId !== estanciaId) throw new ApiError('NO_ENCONTRADO', 'Sala no encontrada.');
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
