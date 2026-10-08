import { EmptyState, PageHeader } from '@sirai/ui';

/** Estructura final de la pantalla; el contenido llega con su módulo. */
export function AuditPage() {
  return (
    <>
      <PageHeader eyebrow="Administración" title="Auditoría" description="Quién hizo cada operación, cuándo, desde qué dirección y qué cambió." />
      <EmptyState title="Consulta de auditoría pendiente" description="La bitácora ya se registra en la base; la consulta en pantalla llega con el módulo de administración." />
    </>
  );
}
