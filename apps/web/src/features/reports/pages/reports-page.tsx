import { EmptyState, PageHeader } from '@sirai/ui';

/** Estructura final de la pantalla; el contenido llega con su módulo. */
export function ReportsPage() {
  return (
    <>
      <PageHeader eyebrow="Dirección" title="Reportes" description="Asistencia por infante, grupo, estancia y periodo, con exportación a Excel y PDF. Los roles centrales ven cifras agregadas." />
      <EmptyState title="Sin datos para reportar" description="Los tableros semaforizados y las exportaciones se construyen en la fase 7." />
    </>
  );
}
