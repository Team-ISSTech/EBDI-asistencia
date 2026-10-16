import type { FollowUp } from '@sirai/contracts';
import { Badge, Table, Td, Th } from '@sirai/ui';
import { ABSENCE_LABELS, CAUSE_LABELS } from './labels';

function CauseCell({ ticket }: { readonly ticket: FollowUp }) {
  if (ticket.cause === null) return <Badge tone="neutral">Sin clasificar</Badge>;
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={ticket.cause === 'NO_LOC' ? 'danger' : 'accent'}>{CAUSE_LABELS[ticket.cause]}</Badge>
      {ticket.requiresMedicalRelease ? <Badge tone="danger">Requiere alta médica</Badge> : null}
    </div>
  );
}

export interface FollowUpsTableProps {
  readonly followUps: readonly FollowUp[];
}

/** Bandeja de trabajo: sin teléfonos ni notas; esos viajan por sus propias rutas auditadas. */
export function FollowUpsTable({ followUps }: FollowUpsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Infante</Th>
          <Th>Ausencia</Th>
          <Th>Causa</Th>
          <Th>Retorno probable</Th>
        </tr>
      </thead>
      <tbody>
        {followUps.map((ticket) => (
          <tr key={ticket.id}>
            <Td>
              <p className="font-medium text-[var(--color-ink)]">{ticket.childName}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {ticket.enrollmentNumber} · {ticket.roomName}
              </p>
            </Td>
            <Td>
              <p>{ABSENCE_LABELS[ticket.absenceStatus]}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{ticket.absenceDate}</p>
            </Td>
            <Td>
              <CauseCell ticket={ticket} />
            </Td>
            <Td className="whitespace-nowrap text-[var(--color-text-muted)]">{ticket.expectedReturnDate ?? 'Por definir'}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
