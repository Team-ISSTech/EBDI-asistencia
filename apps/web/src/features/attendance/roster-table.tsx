import type { RosterEntry } from '@sirai/contracts';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@sirai/domain';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';
import { STATUS_LABELS, timeOf } from './status';

const TONES: Readonly<Record<AttendanceStatus, 'success' | 'danger' | 'accent' | 'neutral'>> = {
  PRESENTE: 'success',
  AUSENTE_JUSTIFICADO: 'accent',
  FALTA_INJUSTIFICADA: 'danger',
  COMISION_MEDICA: 'accent',
  FILTRO_SANITARIO: 'accent',
};

interface StatusButtonsProps {
  readonly entry: RosterEntry;
  readonly current: AttendanceStatus | null;
  readonly onSelect: (status: AttendanceStatus) => void;
}

/** RF-29: con candado médico no se puede marcar Presente; lo demás sí. */
const isBlocked = (entry: RosterEntry, status: AttendanceStatus): boolean => entry.medicalLock && status === 'PRESENTE';

/** Un botón por estado; el activo queda marcado con `aria-pressed`. */
function StatusButtons({ entry, current, onSelect }: StatusButtonsProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Asistencia de ${entry.childName}`}>
      {ATTENDANCE_STATUSES.map((status) => (
        <Button key={status} variant={current === status ? 'primary' : 'ghost'} aria-pressed={current === status} disabled={isBlocked(entry, status)} onClick={() => onSelect(status)}>
          {STATUS_LABELS[status]}
        </Button>
      ))}
    </div>
  );
}

export interface RosterTableProps {
  readonly entries: readonly RosterEntry[];
  readonly statusOf: (entry: RosterEntry) => AttendanceStatus | null;
  /** Sin esta función la tabla es de solo lectura. */
  readonly onSelect?: (enrollmentId: number, status: AttendanceStatus) => void;
  /** S-27: abre la salida y las incidencias de un infante que ingresó. */
  readonly onOpenDay?: (entry: RosterEntry) => void;
}

/** Solo quien ingresó (Presente guardado en el servidor) tiene salida e incidencias. */
function DayCell({ entry, onOpenDay }: { readonly entry: RosterEntry; readonly onOpenDay?: RosterTableProps['onOpenDay'] }) {
  if (entry.status !== 'PRESENTE') return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  const incidents = entry.incidentCount === 1 ? '1 incidencia' : `${entry.incidentCount} incidencias`;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-xs text-[var(--color-text-muted)]">
        {entry.leftAt === null ? 'En la estancia' : `Salió ${timeOf(entry.leftAt)}`}
        {entry.incidentCount > 0 ? ` · ${incidents}` : ''}
      </span>
      {onOpenDay ? (
        <Button variant="ghost" aria-label={`Salida e incidencias de ${entry.childName}`} onClick={() => onOpenDay(entry)}>
          Salida e incidencias
        </Button>
      ) : null}
    </div>
  );
}

export function RosterTable({ entries, statusOf, onSelect, onOpenDay }: RosterTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Infante</Th>
          <Th>Sala</Th>
          <Th>Asistencia</Th>
          <Th>Salida</Th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const current = statusOf(entry);
          return (
            <tr key={entry.enrollmentId}>
              <Td>
                <p className="font-medium text-[var(--color-ink)]">{entry.childName}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{entry.enrollmentNumber}</p>
                {entry.medicalLock ? (
                  <Badge tone="danger" className="mt-1">
                    Requiere alta médica
                  </Badge>
                ) : null}
              </Td>
              <Td>{entry.roomName}</Td>
              <Td>
                {onSelect ? (
                  <StatusButtons entry={entry} current={current} onSelect={(status) => onSelect(entry.enrollmentId, status)} />
                ) : current ? (
                  <Badge tone={TONES[current]}>{STATUS_LABELS[current]}</Badge>
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)]">Sin marcar</span>
                )}
              </Td>
              <Td>
                <DayCell entry={entry} {...(onOpenDay ? { onOpenDay } : {})} />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
