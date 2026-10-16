import { EmptyState, PageHeader } from '@sirai/ui';
import { FollowUpsTable } from '../follow-ups-table';
import { useFollowUps } from '../use-follow-ups';

/** Bandeja de seguimientos de la estancia: cada ausencia al cierre de las 9:00 abre un caso. */
export function FollowUpsPage() {
  const query = useFollowUps();
  return (
    <>
      <PageHeader eyebrow="Seguimiento" title="Seguimientos" description="Casos abiertos por ausencias: llamadas al tutor, clasificación de la causa, fecha probable de regreso y alta médica." />
      {query.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Cargando seguimientos…</p> : null}
      {query.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo cargar la bandeja de seguimientos.
        </p>
      ) : null}
      {query.data && query.data.followUps.length === 0 ? (
        <EmptyState title="Sin seguimientos pendientes" description="Cada ausencia al cierre de las 9:00 abrirá un caso aquí." />
      ) : null}
      {query.data && query.data.followUps.length > 0 ? <FollowUpsTable followUps={query.data.followUps} /> : null}
    </>
  );
}
