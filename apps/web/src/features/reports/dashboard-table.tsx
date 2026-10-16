import type { DashboardRow } from '@sirai/contracts';
import { Badge, Table, Td, Th } from '@sirai/ui';
import { LIGHT_LABELS, LIGHT_TONES, formatRate } from './lights';

export interface DashboardTableProps {
  readonly rows: readonly DashboardRow[];
}

/** Una fila por estancia: solo conteos y porcentajes, nada identificable de infantes. */
export function DashboardTable({ rows }: DashboardTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Estancia</Th>
          <Th>Región</Th>
          <Th>Semáforo</Th>
          <Th>Asistencia</Th>
          <Th>Presentes</Th>
          <Th>Ausentes</Th>
          <Th>Pendientes</Th>
          <Th>Inscritos</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.estanciaId}>
            <Td>
              <p className="font-medium text-[var(--color-ink)]">{row.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{row.code}</p>
            </Td>
            <Td>{row.region ?? '—'}</Td>
            <Td>
              <Badge tone={LIGHT_TONES[row.light]}>{LIGHT_LABELS[row.light]}</Badge>
            </Td>
            <Td className="font-medium">{formatRate(row.rate)}</Td>
            <Td>{row.present}</Td>
            <Td>{row.absent}</Td>
            <Td>{row.pending}</Td>
            <Td>{row.enrolled}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
