import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { EncryptionService } from '../crypto/encryption.service';
import { DB } from '../database/database.module';
import { packIp, type RequestContext } from '../http/request-context';

/** Largo de la columna `auditoria.accion`: una acción más larga haría fallar la operación completa. */
export const AUDIT_ACTION_MAX_LENGTH = 30;

/** Acciones que se registran en la bitácora. */
export const AUDIT_ACTIONS = [
  'USUARIOS_CONSULTADOS',
  'LOGIN',
  'LOGIN_FALLIDO',
  'CUENTA_BLOQUEADA',
  'LOGOUT',
  'CAMBIO_ESTANCIA',
  'USUARIO_CREADO',
  'ROLES_REEMPLAZADOS',
  'INFANTES_CONSULTADOS',
  'INFANTE_REGISTRADO',
  'TUTOR_REGISTRADO',
  'TUTOR_VINCULADO',
  'TUTORES_CONSULTADOS',
  'TELEFONO_CONSULTADO',
  'CONSENTIMIENTO_REGISTRADO',
  'CONSENTIMIENTO_REVOCADO',
  'CONSENTIMIENTOS_CONSULTADOS',
  'JORNADA_ABIERTA',
  'JORNADA_CERRADA',
  'ASISTENCIA_REGISTRADA',
  'ASISTENCIA_MODIFICADA',
  'LISTA_ASISTENCIA_CONSULTADA',
  'SEGUIMIENTO_ABIERTO',
  'SEGUIMIENTOS_CONSULTADOS',
  'CONTACTO_REGISTRADO',
  'NOTAS_SEGUIMIENTO_CONSULTADAS',
  'ALTA_MEDICA_REGISTRADA',
  'SEGUIMIENTO_CERRADO',
  'REPORTE_EXPORTADO',
  'EXPEDIENTE_EXPORTADO',
  'EXPEDIENTE_VERIFICADO',
  'ESTANCIA_CREADA',
  'ESTANCIA_ACTUALIZADA',
  'ESTANCIA_DADA_DE_BAJA',
  'SALA_CREADA',
  'SALA_ACTUALIZADA',
  'SALA_DADA_DE_BAJA',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  readonly userId: number | null;
  readonly roleCode: string | null;
  readonly action: AuditAction;
  readonly tableName: string;
  readonly recordId: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly request: RequestContext;
}

/** Cliente o transacción Drizzle: lo que sea capaz de insertar y actualizar. */
export type AuditExecutor = Pick<Db, 'insert' | 'update'>;

/**
 * Bitácora inmutable (RNF-02): solo inserta. Los diffs se cifran porque
 * pueden contener datos personales. Si se pasa la transacción de la
 * operación, el cambio y su rastro se confirman juntos o ninguno.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly encryption: EncryptionService,
  ) {}

  async record(entry: AuditEntry, executor: AuditExecutor = this.db): Promise<void> {
    await executor.insert(schema.auditoria).values({
      userId: entry.userId,
      roleCode: entry.roleCode,
      action: entry.action,
      tableName: entry.tableName,
      recordId: entry.recordId,
      previousDataEncrypted: this.encryption.encryptJson(entry.before ?? null),
      newDataEncrypted: this.encryption.encryptJson(entry.after ?? null),
      ipAddress: packIp(entry.request.ip),
      userAgent: entry.request.userAgent,
      requestId: entry.request.requestId,
      occurredAt: new Date(),
    });
  }
}
