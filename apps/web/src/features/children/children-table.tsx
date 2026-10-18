import type { Child } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';

const fullName = (child: Child): string =>
  [child.name, child.paternalSurname, child.maternalSurname].filter((part): part is string => Boolean(part)).join(' ');

export interface ChildrenTableProps {
  readonly children: readonly Child[];
  readonly onSelect: (child: Child) => void;
  /** Sin esta función no hay botón de expediente (RF-19). */
  readonly onExport?: (child: Child) => void;
  /** Sin estas funciones no hay editar ni eliminar (RF-33). */
  readonly onEdit?: (child: Child) => void;
  readonly onDelete?: (child: Child) => void;
  /** Cambio de sala, traslado o baja (RF-35). */
  readonly onMove?: (child: Child) => void;
}

/** Padrón de la estancia: nombre, matrícula y sala; sin datos de salud. */
export function ChildrenTable({ children, onSelect, onExport, onEdit, onDelete, onMove }: ChildrenTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Infante</Th>
          <Th>Matrícula</Th>
          <Th>Sala</Th>
          <Th>Nacimiento</Th>
          <Th>Estatus</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {children.map((child) => (
          <tr key={child.id}>
            <Td className="font-medium text-[var(--color-ink)]">{fullName(child)}</Td>
            <Td>{child.enrollmentNumber}</Td>
            <Td>{child.roomName}</Td>
            <Td className="whitespace-nowrap text-[var(--color-text-muted)]">{child.birthDate}</Td>
            <Td>
              <Badge tone={child.status === 'ACTIVO' ? 'success' : 'neutral'}>{child.status === 'ACTIVO' ? 'Activo' : 'Baja'}</Badge>
            </Td>
            <Td>
              <Button variant="ghost" aria-label={`Tutores de ${child.name} ${child.paternalSurname}`} onClick={() => onSelect(child)}>
                Tutores
              </Button>
              {onEdit ? (
                <Button variant="ghost" aria-label={`Editar a ${child.name} ${child.paternalSurname}`} onClick={() => onEdit(child)}>
                  Editar
                </Button>
              ) : null}
              {onMove ? (
                <Button variant="ghost" aria-label={`Movimientos de ${child.name} ${child.paternalSurname}`} onClick={() => onMove(child)}>
                  Movimientos
                </Button>
              ) : null}
              {onDelete ? (
                <Button variant="ghost" aria-label={`Eliminar a ${child.name} ${child.paternalSurname}`} onClick={() => onDelete(child)}>
                  Eliminar
                </Button>
              ) : null}
              {onExport ? (
                <Button variant="ghost" aria-label={`Expediente de ${child.name} ${child.paternalSurname}`} onClick={() => onExport(child)}>
                  Expediente
                </Button>
              ) : null}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
