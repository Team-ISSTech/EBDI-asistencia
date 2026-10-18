import type { TransactionHook } from '../../identity/repositories/repositories';
import type { EnrollmentRecord, MovementRecord, PendingTransferRecord, TransferDestinationRecord } from '../children.types';

/** Todo cambio de inscripción escribe su movimiento y su auditoría en la misma transacción. */
export interface EnrollmentsRepository {
  /** Inscripción activa del infante en la estancia, o null. */
  findActive(childId: number, estanciaId: number): Promise<EnrollmentRecord | null>;
  /** Estancias activas distintas de la indicada. */
  listTransferDestinations(exceptEstanciaId: number): Promise<TransferDestinationRecord[]>;
  isEstanciaActive(id: number): Promise<boolean>;
  changeRoom(enrollment: EnrollmentRecord, movement: MovementRecord, userId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  /** Cierra la inscripción (BAJA o TRASLADADA) con su fecha de fin; la baja también marca al infante. */
  finish(
    enrollment: EnrollmentRecord,
    status: 'BAJA' | 'TRASLADADA',
    movement: MovementRecord,
    userId: number,
    now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void>;
  listPendingTransfers(toEstanciaId: number): Promise<PendingTransferRecord[]>;
  findPendingTransfer(enrollmentId: number, toEstanciaId: number): Promise<PendingTransferRecord | null>;
  /** Inscripción nueva en la estancia de destino con su movimiento ALTA; devuelve el id del infante. */
  receiveTransfer(
    transfer: PendingTransferRecord,
    destination: { estanciaId: number; roomId: number; schoolYearId: number },
    userId: number,
    now: Date,
    inSameTransaction?: TransactionHook<void>,
  ): Promise<void>;
}

export const ENROLLMENTS_REPOSITORY = Symbol('ENROLLMENTS_REPOSITORY');
