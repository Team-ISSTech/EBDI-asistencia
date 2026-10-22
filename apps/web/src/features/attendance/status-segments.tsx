import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@sirai/domain';
import { clsx } from 'clsx';
import { STATUS_LABELS, STATUS_SELECTED_CLASSES, STATUS_SHORT_LABELS } from './status';

const SEGMENT =
  'relative -ml-px border px-2.5 py-2.5 text-sm font-semibold whitespace-nowrap xl:px-3 first:ml-0 first:rounded-l-[var(--radius-md)] last:rounded-r-[var(--radius-md)] ' +
  'transition-[background-color,color] duration-[var(--duration-fast)] ' +
  'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed';

const UNSELECTED =
  'border-[var(--color-ink-muted)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-paper)] ' +
  'disabled:border-[var(--color-line)] disabled:bg-[var(--color-paper)] disabled:text-[var(--color-ink-muted)] disabled:line-through disabled:hover:bg-[var(--color-paper)]';

/** El elegido toma el color de su estado; el borde igual al fondo para que se lea como un solo bloque. */
const SELECTED = 'z-[1] border-transparent disabled:opacity-60';

export interface StatusSegmentsProps {
  /** Nombre del infante, para el nombre accesible del grupo. */
  readonly childName: string;
  readonly current: AttendanceStatus | null;
  readonly isBlocked: (status: AttendanceStatus) => boolean;
  readonly onSelect: (status: AttendanceStatus) => void;
}

/**
 * Los cinco estados en un control segmentado de una sola línea. A la vista va el texto corto; el nombre
 * accesible y la ayuda emergente llevan el nombre completo. El activo queda marcado con `aria-pressed`.
 */
export function StatusSegments({ childName, current, isBlocked, onSelect }: StatusSegmentsProps) {
  return (
    <div className="inline-flex" role="group" aria-label={`Asistencia de ${childName}`}>
      {ATTENDANCE_STATUSES.map((status) => {
        const selected = current === status;
        return (
          <button
            key={status}
            type="button"
            className={clsx(SEGMENT, selected ? [SELECTED, STATUS_SELECTED_CLASSES[status]] : UNSELECTED)}
            aria-label={STATUS_LABELS[status]}
            title={STATUS_LABELS[status]}
            aria-pressed={selected}
            disabled={isBlocked(status)}
            onClick={() => onSelect(status)}
          >
            {STATUS_SHORT_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}
