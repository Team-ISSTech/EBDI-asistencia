import type { FollowUp } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';
import { ABSENCE_LABELS, CAUSE_LABELS } from './labels';

const formatTime = (iso: string): string => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

function CauseCell({ ticket }: { readonly ticket: FollowUp }) {
  if (ticket.cause === null) return <Badge tone="neutral">Sin clasificar</Badge>;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        <Badge tone={ticket.cause === 'NO_LOC' ? 'danger' : 'accent'}>{CAUSE_LABELS[ticket.cause]}</Badge>
        {ticket.requiresMedicalRelease ? (
          ticket.medicalReleased ? <Badge tone="success">Alta médica registrada</Badge> : <Badge tone="danger">Requiere alta médica</Badge>
        ) : null}
        {ticket.emergencyAlert ? <Badge tone="danger">Avisar a contactos de emergencia</Badge> : null}
      </div>
      {ticket.nextAttemptAt ? <span className="text-xs text-[var(--color-text-muted)]">Segundo intento: {formatTime(ticket.nextAttemptAt)}</span> : null}
    </div>
  );
}

export interface FollowUpsTableProps {
  readonly followUps: readonly FollowUp[];
  /** Sin esta función la tabla es de solo lectura (no hay botón de llamadas). */
  readonly onSelect?: (followUp: FollowUp) => void;
}

/** Bandeja de trabajo: sin teléfonos ni notas; esos viajan por sus propias rutas auditadas. */
export function FollowUpsTable({ followUps, onSelect }: FollowUpsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Infante</Th>
          <Th>Ausencia</Th>
          <Th>Causa</Th>
          <Th>Retorno probable</Th>
          <Th>Llamadas</Th>
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
            <Td className="whitespace-nowrap">
              <span className="mr-2 text-sm text-[var(--color-text-muted)]">{ticket.attemptCount}</span>
              {onSelect ? (
                <Button variant="ghost" aria-label={`Llamadas de ${ticket.childName}`} onClick={() => onSelect(ticket)}>
                  Llamadas
                </Button>
              ) : null}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
