import type { FollowUp } from '@sirai/contracts';
import { EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../../auth/use-session';
import { ContactPanel } from '../contact-panel';
import { FollowUpsTable } from '../follow-ups-table';
import { useFollowUps } from '../use-follow-ups';

interface FollowUpsContentProps {
  readonly query: ReturnType<typeof useFollowUps>;
  readonly onSelect: ((followUp: FollowUp) => void) | undefined;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function FollowUpsContent({ query, onSelect }: FollowUpsContentProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando seguimientos…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar la bandeja de seguimientos.
      </p>
    );
  }
  if (query.data.followUps.length === 0) {
    return <EmptyState title="Sin seguimientos pendientes" description="Cada ausencia al cierre de las 9:00 abrirá un caso aquí." />;
  }
  return <FollowUpsTable followUps={query.data.followUps} {...(onSelect ? { onSelect } : {})} />;
}

/** Bandeja de seguimientos de la estancia: cada ausencia al cierre de las 9:00 abre un caso. */
export function FollowUpsPage() {
  const { data: session } = useSession();
  const query = useFollowUps();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const canRegister = session?.permissions.includes('SEGUIMIENTO_REGISTRAR') ?? false;
  /** Se toma el ticket de la lista vigente: tras registrar una llamada, el panel ve el estado nuevo. */
  const selected = query.data?.followUps.find((ticket) => ticket.id === selectedId) ?? null;

  return (
    <>
      <PageHeader eyebrow="Seguimiento" title="Seguimientos" description="Casos abiertos por ausencias: llamadas al tutor, clasificación de la causa, fecha probable de regreso y alta médica." />
      {selected ? <ContactPanel key={selected.id} followUp={selected} onClose={() => setSelectedId(null)} /> : null}
      <FollowUpsContent query={query} onSelect={canRegister ? (ticket) => setSelectedId(ticket.id) : undefined} />
    </>
  );
}
