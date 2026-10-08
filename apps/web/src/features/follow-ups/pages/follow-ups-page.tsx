import { EmptyState, PageHeader } from '@sirai/ui';

/** Estructura final de la pantalla; el contenido llega con su módulo. */
export function FollowUpsPage() {
  return (
    <>
      <PageHeader eyebrow="Seguimiento" title="Seguimientos" description="Casos abiertos por ausencias: llamadas al tutor, clasificación de la causa, fecha probable de regreso y alta médica." />
      <EmptyState title="Sin seguimientos abiertos" description="Cada ausencia al cierre de las 9:00 creará un caso aquí (fase 6)." />
    </>
  );
}
