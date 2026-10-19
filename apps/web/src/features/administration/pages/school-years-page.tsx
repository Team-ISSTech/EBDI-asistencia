import type { PurgeSchoolYearResponse, SchoolYearView } from '@sirai/contracts';
import { Button, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useState } from 'react';
import { PurgeYearCard } from '../purge-year-card';
import { SchoolYearForm } from '../school-year-form';
import { SchoolYearsTable } from '../school-years-table';
import { useSchoolYearActions, useSchoolYears } from '../use-school-years';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const resultText = ({ contacts, releases }: PurgeSchoolYearResponse): string =>
  `Se vaciaron los datos sensibles de ${plural(contacts, 'contacto', 'contactos')} y ${plural(releases, 'alta médica', 'altas médicas')}.`;

interface ListProps {
  readonly query: ReturnType<typeof useSchoolYears>;
  readonly onPurge: (year: SchoolYearView) => void;
}

/** Carga, error, vacío o tabla: un solo estado a la vez. */
function SchoolYearsList({ query, onPurge }: ListProps) {
  if (query.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando ciclos…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar la lista de ciclos.
      </p>
    );
  }
  if (query.data.schoolYears.length === 0) {
    return <EmptyState title="Aún no hay ciclos escolares" description="Abre el primer ciclo para poder registrar jornadas e infantes." />;
  }
  return <SchoolYearsTable years={query.data.schoolYears} onPurge={onPurge} />;
}

/** Ciclos escolares y retención (RNF-05): abrir el nuevo, ver lo archivado y depurar lo que cumplió 5 años. */
export function SchoolYearsPage() {
  const years = useSchoolYears();
  const { open } = useSchoolYearActions();
  const [showForm, setShowForm] = useState(false);
  const [purging, setPurging] = useState<SchoolYearView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggleForm = () => {
    open.reset();
    setNotice(null);
    setShowForm((visible) => !visible);
  };
  const startPurge = (year: SchoolYearView) => {
    setNotice(null);
    setPurging(year);
  };

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Ciclos escolares"
        description="Un ciclo archivado queda de solo lectura y se conserva 5 años; pasado ese plazo se pueden depurar sus datos sensibles cifrados, sin borrar los registros."
        actions={<Button onClick={toggleForm}>{showForm ? 'Cancelar' : 'Abrir ciclo nuevo'}</Button>}
      />
      {showForm ? (
        <Card className="mb-8">
          <SchoolYearForm pending={open.isPending} error={open.error} onSubmit={(body) => open.mutate(body, { onSuccess: () => setShowForm(false) })} />
        </Card>
      ) : null}
      {purging ? (
        <PurgeYearCard
          key={purging.id}
          year={purging}
          onDone={(result) => {
            setPurging(null);
            setNotice(resultText(result));
          }}
          onCancel={() => setPurging(null)}
        />
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 text-sm font-medium text-[var(--color-ink)]">
          {notice}
        </p>
      ) : null}
      <SchoolYearsList query={years} onPurge={startPurge} />
    </>
  );
}
