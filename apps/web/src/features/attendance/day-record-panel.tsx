import type { RosterEntry } from '@sirai/contracts';
import { Button, Card } from '@sirai/ui';
import { DepartureForm } from './departure-form';
import { IncidentForm } from './incident-form';
import { INCIDENT_LABELS, timeOf } from './status';
import { useAuthorizedPickups, useIncidents, useRegisterDeparture, useRegisterIncident } from './use-departures';

export interface DayRecordPanelProps {
  readonly journeyId: number;
  readonly entry: RosterEntry;
  /** Registrar salida e incidencias: quien pasa lista y con la jornada abierta. */
  readonly canRegister: boolean;
  /** Leer la descripción de las incidencias (notas sensibles). */
  readonly canReadDetail: boolean;
  readonly onClose: () => void;
}

function Departure({ journeyId, entry }: { readonly journeyId: number; readonly entry: RosterEntry }) {
  const pickups = useAuthorizedPickups(journeyId, entry.enrollmentId, entry.leftAt === null);
  const register = useRegisterDeparture(journeyId, entry.enrollmentId);
  if (entry.leftAt !== null) return <p className="text-sm font-medium text-[var(--color-ink)]">Salió a las {timeOf(entry.leftAt)}.</p>;
  if (pickups.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando tutores autorizados…</p>;
  if (pickups.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo consultar quién puede recoger al infante. Revisa la conexión.
      </p>
    );
  }
  return <DepartureForm guardians={pickups.data.guardians} pending={register.isPending} error={register.error} onSubmit={(guardianId) => register.mutate(guardianId)} />;
}

function Incidents({ journeyId, entry, canRegister, canReadDetail }: Omit<DayRecordPanelProps, 'onClose'>) {
  const incidents = useIncidents(journeyId, entry.enrollmentId, canReadDetail);
  const register = useRegisterIncident(journeyId, entry.enrollmentId);
  const list = incidents.data?.incidents ?? [];
  return (
    <div className="flex flex-col gap-3">
      {incidents.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudieron consultar las incidencias.
        </p>
      ) : null}
      {incidents.isSuccess && list.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Sin incidencias hoy.</p> : null}
      {list.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {list.map((incident) => (
            <li key={incident.id} className="text-sm">
              <span className="font-medium text-[var(--color-ink)]">{INCIDENT_LABELS[incident.type]}</span> · {timeOf(incident.recordedAt)}
              {incident.description === null ? null : <p className="text-[var(--color-text)]">{incident.description}</p>}
            </li>
          ))}
        </ul>
      ) : null}
      {canRegister ? <IncidentForm pending={register.isPending} error={register.error} onSubmit={(body) => register.mutateAsync(body)} /> : null}
    </div>
  );
}

/** Salida e incidencias del día de un infante que ingresó (S-27). */
export function DayRecordPanel({ journeyId, entry, canRegister, canReadDetail, onClose }: DayRecordPanelProps) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-ink)]">{entry.childName}</h2>
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      <section aria-labelledby="salida-heading" className="flex flex-col gap-3">
        <h3 id="salida-heading" className="text-sm font-semibold text-[var(--color-ink)]">
          Salida
        </h3>
        {canRegister || entry.leftAt !== null ? <Departure journeyId={journeyId} entry={entry} /> : <p className="text-sm text-[var(--color-text-muted)]">Sin salida registrada.</p>}
      </section>
      <section aria-labelledby="incidencias-heading" className="flex flex-col gap-3">
        <h3 id="incidencias-heading" className="text-sm font-semibold text-[var(--color-ink)]">
          Incidencias
        </h3>
        <Incidents journeyId={journeyId} entry={entry} canRegister={canRegister} canReadDetail={canReadDetail} />
      </section>
    </Card>
  );
}
