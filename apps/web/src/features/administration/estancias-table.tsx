import type { EstanciaAdmin } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';

export interface EstanciasTableProps {
  readonly estancias: readonly EstanciaAdmin[];
  readonly onEdit: (estancia: EstanciaAdmin) => void;
  readonly onToggle: (estancia: EstanciaAdmin) => void;
  readonly onRetire: (estancia: EstanciaAdmin) => void;
}

/** Catálogo de estancias con sus acciones; los nombres de las acciones incluyen la estancia para los lectores de pantalla. */
export function EstanciasTable({ estancias, onEdit, onToggle, onRetire }: EstanciasTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Estancia</Th>
          <Th>Región</Th>
          <Th>Zona horaria</Th>
          <Th>Estatus</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {estancias.map((estancia) => (
          <tr key={estancia.id}>
            <Td>
              <p className="font-medium text-[var(--color-ink)]">{estancia.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{estancia.code}</p>
            </Td>
            <Td>{estancia.region ?? '—'}</Td>
            <Td className="whitespace-nowrap text-[var(--color-text-muted)]">{estancia.timeZone}</Td>
            <Td>
              <Badge tone={estancia.status === 'ACTIVA' ? 'success' : 'neutral'}>{estancia.status === 'ACTIVA' ? 'Activa' : 'Inactiva'}</Badge>
            </Td>
            <Td className="whitespace-nowrap">
              <Button variant="ghost" aria-label={`Editar ${estancia.name}`} onClick={() => onEdit(estancia)}>
                Editar
              </Button>
              <Button variant="ghost" aria-label={`${estancia.status === 'ACTIVA' ? 'Desactivar' : 'Reactivar'} ${estancia.name}`} onClick={() => onToggle(estancia)}>
                {estancia.status === 'ACTIVA' ? 'Desactivar' : 'Reactivar'}
              </Button>
              <Button variant="ghost" aria-label={`Dar de baja ${estancia.name}`} onClick={() => onRetire(estancia)}>
                Dar de baja
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
