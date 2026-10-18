import type { AuditEntryView } from '@sirai/contracts';
import { isRoleCode } from '@sirai/auth';
import { Badge, Table, Td, Th } from '@sirai/ui';
import { ROLE_LABELS } from '../../lib/labels';

const formatDate = (iso: string): string => new Date(iso).toLocaleString('es-MX');

/** `roleCode` puede traer varios roles separados por coma; los desconocidos se muestran tal cual. */
const roleText = (code: string | null): string | null =>
  code === null ? null : code.split(',').map((part) => (isRoleCode(part) ? ROLE_LABELS[part] : part)).join(', ');

function ActionCell({ entry }: { readonly entry: AuditEntryView }) {
  return (
    <>
      <p className="font-[family-name:var(--font-mono,monospace)] text-xs font-semibold text-[var(--color-ink)]">{entry.action}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{entry.recordId === null ? entry.tableName : `${entry.tableName} · ${entry.recordId}`}</p>
    </>
  );
}

function PersonCell({ entry }: { readonly entry: AuditEntryView }) {
  if (entry.systemName !== null) {
    return (
      <>
        <p className="font-medium text-[var(--color-ink)]">{entry.systemName}</p>
        <p className="text-xs text-[var(--color-text-muted)]">Sistema externo</p>
      </>
    );
  }
  if (entry.userId === null) return <span className="text-xs text-[var(--color-text-muted)]">Sin persona</span>;
  return (
    <>
      <p className="font-medium text-[var(--color-ink)]">{entry.userName ?? `Usuario ${entry.userId}`}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{roleText(entry.roleCode)}</p>
    </>
  );
}

/** Solo nombres de campo: los valores del cambio no se exponen a quien audita. */
function FieldsCell({ fields }: { readonly fields: readonly string[] }) {
  if (fields.length === 0) return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {fields.map((field) => (
        <Badge key={field} tone="neutral">
          {field}
        </Badge>
      ))}
    </div>
  );
}

export function AuditTable({ entries }: { readonly entries: readonly AuditEntryView[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Fecha</Th>
          <Th>Persona</Th>
          <Th>Acción y registro</Th>
          <Th>Campos cambiados</Th>
          <Th>Origen</Th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <Td className="whitespace-nowrap text-[var(--color-text-muted)]">{formatDate(entry.occurredAt)}</Td>
            <Td>
              <PersonCell entry={entry} />
            </Td>
            <Td>
              <ActionCell entry={entry} />
            </Td>
            <Td>
              <FieldsCell fields={entry.changedFields} />
            </Td>
            <Td className="whitespace-nowrap text-xs text-[var(--color-text-muted)]">{entry.ipAddress ?? '—'}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
