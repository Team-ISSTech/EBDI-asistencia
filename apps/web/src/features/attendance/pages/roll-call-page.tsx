import { ApiClientError } from '../../../lib/api-client';
import { SHIFTS, type Shift } from '@sirai/domain';
import { Button, EmptyState, PageHeader, Select } from '@sirai/ui';
import { useState } from 'react';
import { useSession } from '../../auth/use-session';
import { JourneyPanel } from '../journey-panel';
import { useJourney, useOpenJourney } from '../use-attendance';

const SHIFT_LABELS: Readonly<Record<Shift, string>> = { MATUTINO: 'Matutino', VESPERTINO: 'Vespertino' };

/** Fecha local del dispositivo en formato `YYYY-MM-DD`. */
const localDate = (): string => new Date().toLocaleDateString('en-CA');

interface NoJourneyProps {
  readonly date: string;
  readonly shift: Shift;
  readonly canOpen: boolean;
}

function NoJourney({ date, shift, canOpen }: NoJourneyProps) {
  const open = useOpenJourney(date, shift);
  return (
    <div className="flex flex-col gap-4">
      <EmptyState
        title="Todavía no hay jornada abierta"
        description={canOpen ? 'Abre la jornada de hoy para empezar a pasar lista.' : 'La directora de la estancia debe abrir la jornada para empezar a pasar lista.'}
      />
      {canOpen ? (
        <Button className="self-start" loading={open.isPending} onClick={() => open.mutate()}>
          Abrir jornada
        </Button>
      ) : null}
      {open.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {open.error instanceof ApiClientError ? open.error.message : 'No se pudo abrir la jornada.'}
        </p>
      ) : null}
    </div>
  );
}

/** Pase de lista del día: abrir la jornada, marcar a todos presentes, ajustar excepciones y guardar. */
export function RollCallPage() {
  const { data: session } = useSession();
  const [shift, setShift] = useState<Shift>('MATUTINO');
  const [date] = useState(localDate);
  const journey = useJourney(date, shift);
  const canOpen = session?.permissions.includes('JORNADA_CERRAR') ?? false;

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Pase de lista"
        description={`Asistencia del ${date}. Marca a todos presentes y ajusta solo las excepciones.`}
        actions={
          <Select label="Turno" value={shift} onChange={(event) => setShift(event.target.value as Shift)}>
            {SHIFTS.map((option) => (
              <option key={option} value={option}>
                {SHIFT_LABELS[option]}
              </option>
            ))}
          </Select>
        }
      />
      {journey.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Buscando la jornada…</p> : null}
      {journey.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo consultar la jornada.
        </p>
      ) : null}
      {journey.data === null ? <NoJourney date={date} shift={shift} canOpen={canOpen} /> : null}
      {journey.data ? <JourneyPanel key={journey.data.id} journey={journey.data} date={date} shift={shift} /> : null}
    </>
  );
}
