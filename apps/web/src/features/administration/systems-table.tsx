import type { SystemView } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';
import { INTEGRATION_SCOPE_LABELS } from '../../lib/labels';

const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('es-MX') : 'Nunca');

export interface SystemsTableProps {
  readonly systems: readonly SystemView[];
  readonly onRevoke: (system: SystemView) => void;
}

/** Sistemas registrados; el secreto no existe aquí, solo el identificador público. */
export function SystemsTable({ systems, onRevoke }: SystemsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Sistema</Th>
          <Th>Alcances</Th>
          <Th>Estatus</Th>
          <Th>Último uso</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {systems.map((system) => (
          <tr key={system.id}>
            <Td>
              <p className="font-medium text-[var(--color-ink)]">{system.name}</p>
              <p className="break-all font-mono text-xs text-[var(--color-text-muted)]">{system.clientId}</p>
            </Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                {system.scopes.map((scope) => (
                  <Badge key={scope} tone="neutral">
                    {INTEGRATION_SCOPE_LABELS[scope]}
                  </Badge>
                ))}
              </div>
            </Td>
            <Td>
              <Badge tone={system.status === 'ACTIVO' ? 'success' : 'danger'}>{system.status === 'ACTIVO' ? 'Activo' : 'Revocado'}</Badge>
            </Td>
            <Td className="whitespace-nowrap text-[var(--color-text-muted)]">{formatDate(system.lastUsedAt)}</Td>
            <Td className="whitespace-nowrap">
              {system.status === 'ACTIVO' ? (
                <Button variant="ghost" aria-label={`Revocar ${system.name}`} onClick={() => onRevoke(system)}>
                  Revocar
                </Button>
              ) : null}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
