import type { Child } from '@sirai/contracts';
import { Badge, Table, Td, Th } from '@sirai/ui';

const fullName = (child: Child): string =>
  [child.name, child.paternalSurname, child.maternalSurname].filter((part): part is string => Boolean(part)).join(' ');

export interface ChildrenTableProps {
  readonly children: readonly Child[];
}

/** Padrón de la estancia: nombre, matrícula y sala; sin datos de salud. */
export function ChildrenTable({ children }: ChildrenTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Infante</Th>
          <Th>Matrícula</Th>
          <Th>Sala</Th>
          <Th>Nacimiento</Th>
          <Th>Estatus</Th>
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
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
