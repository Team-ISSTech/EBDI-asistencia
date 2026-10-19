import type { SchoolYearView } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('es-MX');
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Qué hay que saber de un ciclo según su estado: lo que impide cerrarlo, o cuándo se conserva y se depura. */
function detailOf(year: SchoolYearView): string {
  if (year.purgedAt !== null) return `Depurado el ${formatDate(year.purgedAt)}: sin teléfonos, notas ni observaciones.`;
  if (year.status === 'ARCHIVADO') {
    const archived = year.archivedAt === null ? '' : `Archivado el ${formatDate(year.archivedAt)}. `;
    return `${archived}${year.purgeEligibleOn === null ? '' : `Se puede depurar desde ${formatDate(year.purgeEligibleOn)}.`}`;
  }
  const open = [
    year.usage && year.usage.openJourneys > 0 ? plural(year.usage.openJourneys, 'jornada abierta', 'jornadas abiertas') : null,
    year.usage && year.usage.openFollowUps > 0 ? plural(year.usage.openFollowUps, 'seguimiento sin cerrar', 'seguimientos sin cerrar') : null,
  ].filter((part): part is string => part !== null);
  return open.length === 0 ? 'Todo cerrado: se puede cerrar el ciclo.' : `Falta cerrar: ${open.join(' · ')}.`;
}

function StatusBadge({ year }: { readonly year: SchoolYearView }) {
  if (year.purgedAt !== null) return <Badge tone="neutral">Depurado</Badge>;
  return year.status === 'ACTIVO' ? <Badge tone="success">Activo</Badge> : <Badge tone="accent">Archivado</Badge>;
}

export interface SchoolYearsTableProps {
  readonly years: readonly SchoolYearView[];
  readonly onPurge: (year: SchoolYearView) => void;
}

export function SchoolYearsTable({ years, onPurge }: SchoolYearsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Ciclo</Th>
          <Th>Estatus</Th>
          <Th>Detalle</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {years.map((year) => (
          <tr key={year.id}>
            <Td>
              <p className="font-medium text-[var(--color-ink)]">{year.code}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatDate(year.startDate)} a {formatDate(year.endDate)}
              </p>
            </Td>
            <Td>
              <StatusBadge year={year} />
            </Td>
            <Td className="text-[var(--color-text-muted)]">{detailOf(year)}</Td>
            <Td className="whitespace-nowrap">
              {year.canPurge ? (
                <Button variant="ghost" aria-label={`Depurar el ciclo ${year.code}`} onClick={() => onPurge(year)}>
                  Depurar
                </Button>
              ) : null}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
