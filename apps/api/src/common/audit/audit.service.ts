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
  'AUDITORIA_CONSULTADA',
  'CICLO_ARCHIVADO',
  'CICLO_ABIERTO',
  'CICLO_DEPURADO',
  'SISTEMA_REGISTRADO',
  'SISTEMA_REVOCADO',
  'SISTEMA_TOKEN_EMITIDO',
  'SISTEMA_TOKEN_FALLIDO',
  'SISTEMA_CONSULTA',
  'USUARIO_DADO_DE_BAJA',
  'TUTOR_DADO_DE_BAJA',
  'CONTRASENA_CAMBIADA',
  'CONTRASENA_RESTABLECIDA',
  'INFANTES_CONSULTADOS',
  'INFANTE_REGISTRADO',
  'INFANTE_ACTUALIZADO',
  'INFANTE_ELIMINADO',
  'INSCRIPCION_SALA_CAMBIADA',
  'INSCRIPCION_BAJA',
  'TRASLADO_SOLICITADO',
  'TRASLADO_RECIBIDO',
  'TRASLADOS_CONSULTADOS',
  'TUTOR_REGISTRADO',
  'TUTOR_VINCULADO',
  'TUTOR_ACTUALIZADO',
  'TUTOR_VINC_ACTUALIZADO',
  'TUTOR_DESVINCULADO',
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
  'AVISO_EMERGENCIA_ENVIADO',
  'AVISO_EMERGENCIA_FALLIDO',
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
  /** Sistema externo que hizo la operación (RF-37); excluyente con `userId`. */
  readonly systemId?: number | null;
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
    await executor.insert(schema.auditoria).values(this.row(entry));
  }

  /** Varias entradas con una sola sentencia: un pase de lista de 40 infantes no debe costar 40 viajes a la base. */
  async recordMany(entries: readonly AuditEntry[], executor: AuditExecutor = this.db): Promise<void> {
    if (entries.length === 0) return;
    await executor.insert(schema.auditoria).values(entries.map((entry) => this.row(entry)));
  }

  private row(entry: AuditEntry) {
    return {
      userId: entry.userId,
      systemId: entry.systemId ?? null,
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
    };
  }
}
