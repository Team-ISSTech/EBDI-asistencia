import { EmptyState, PageHeader } from '@sirai/ui';

/** Estructura final de la pantalla; el contenido llega con su módulo. */
export function RollCallPage() {
  return (
    <>
      <PageHeader eyebrow="Operación" title="Pase de lista" description="Aquí aparecerá la lista de la sala o grupo con los estados Presente, Ausente justificado, Falta injustificada, Comisión médica y Filtro sanitario." />
      <EmptyState title="Todavía no hay jornada abierta" description="El pase de lista se habilita en la fase 4 del plan de desarrollo. Cuando exista, abrir la jornada tomará un clic." />
    </>
  );
}
