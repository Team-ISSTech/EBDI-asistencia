import type { Contact } from '@sirai/contracts';
import { Badge } from '@sirai/ui';

const formatDateTime = (iso: string): string => new Date(iso).toLocaleString('es-MX');

export interface ContactHistoryProps {
  readonly contacts: readonly Contact[];
}

/** Intentos en orden, con la nota de asesoría descifrada por el servidor. */
export function ContactHistory({ contacts }: ContactHistoryProps) {
  if (contacts.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">Todavía no hay llamadas registradas.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {contacts.map((contact) => (
        <li key={contact.id} className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-ink)]">Intento {contact.attemptNumber}</span>
            <Badge tone={contact.result === 'CONTACTADO' ? 'success' : 'danger'}>{contact.result === 'CONTACTADO' ? 'Habló con el tutor' : 'No contestó'}</Badge>
            <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(contact.occurredAt)}</span>
          </div>
          {contact.notes ? <p className="mt-2 text-sm text-[var(--color-text)]">{contact.notes}</p> : null}
        </li>
      ))}
    </ol>
  );
}
