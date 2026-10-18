import type { AuditEntryView } from '@sirai/contracts';
import { Button, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { useUsers } from '../../administration/use-users';
import { AuditFilters } from '../audit-filters';
import { AuditTable } from '../audit-table';
import { type AuditFilterValues, useAuditEntries, useAuditFilters } from '../use-audit';

interface ResultsProps {
  readonly audit: ReturnType<typeof useAuditEntries>;
  readonly entries: readonly AuditEntryView[];
}

/** Carga, error, vacío o tabla con su botón de "cargar más": un solo estado a la vez. */
function AuditResults({ audit, entries }: ResultsProps) {
  if (audit.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando bitácora…</p>;
  if (audit.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar la bitácora.
      </p>
    );
  }
  if (entries.length === 0) return <EmptyState title="Sin registros con esos filtros" description="Prueba con otro rango de fechas o quita algún filtro." />;
  return (
    <>
      <AuditTable entries={entries} />
      {audit.hasNextPage ? (
        <Button className="mt-4" variant="ghost" loading={audit.isFetchingNextPage} onClick={() => void audit.fetchNextPage()}>
          Cargar más
        </Button>
      ) : null}
    </>
  );
}

/** Consulta de la bitácora (RF-11): quién hizo qué, cuándo y desde dónde; del cambio, solo los campos. */
export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilterValues>({});
  const audit = useAuditEntries(filters);
  const available = useAuditFilters();
  const users = useUsers();
  const entries = audit.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Auditoría"
        description="Quién hizo cada operación, cuándo y desde qué dirección. Del cambio se ven solo los nombres de los campos que cambiaron, no sus valores: pueden ser datos de menores."
      />
      <AuditFilters users={users.data?.users ?? []} actions={available.data?.actions ?? []} tables={available.data?.tables ?? []} onApply={setFilters} />
      <AuditResults audit={audit} entries={entries} />
    </>
  );
}
