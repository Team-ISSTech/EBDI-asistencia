import { EmptyState, PageHeader } from '@sirai/ui';

/** Estructura final de la pantalla; el contenido llega con su módulo. */
export function ChildrenPage() {
  return (
    <>
      <PageHeader eyebrow="Operación" title="Infantes" description="Padrón de infantes inscritos en la estancia, con sus grupos y tutores autorizados." />
      <EmptyState title="Sin infantes registrados" description="Los catálogos de estancias, grupos, infantes y tutores llegan en la fase 3. Aquí se verán sin datos sensibles en claro." />
    </>
  );
}
