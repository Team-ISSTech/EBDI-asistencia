import type { DashboardResponse, DashboardRow } from '@sirai/contracts';
import { TRAFFIC_LIGHTS, type TrafficLight } from '@sirai/domain';
import { EmptyState, Field, PageHeader, Select } from '@sirai/ui';
import { useState } from 'react';
import { DashboardSummary } from '../dashboard-summary';
import { ExportBar } from '../export-bar';
import { DashboardTable } from '../dashboard-table';
import { LIGHT_LABELS } from '../lights';
import { useDashboard } from '../use-dashboard';

type LightFilter = TrafficLight | 'TODOS';

const matches = (row: DashboardRow, light: LightFilter, search: string): boolean => {
  const text = `${row.name} ${row.code}`.toLowerCase();
  return (light === 'TODOS' || row.light === light) && text.includes(search.trim().toLowerCase());
};

interface DashboardBodyProps {
  readonly data: DashboardResponse;
  readonly light: LightFilter;
  readonly search: string;
}

/** Resumen y tabla ya filtrada; los estados vacíos distinguen "no hay estancias" de "el filtro no encontró". */
function DashboardBody({ data, light, search }: DashboardBodyProps) {
  if (data.estancias.length === 0) return <EmptyState title="Sin estancias para reportar" description="Tu alcance no incluye estancias activas." />;
  const rows = data.estancias.filter((row) => matches(row, light, search));
  return (
    <>
      <DashboardSummary totals={data.totals} />
      {rows.length === 0 ? <EmptyState title="Ninguna estancia coincide con el filtro" description="Cambia el color o la búsqueda." /> : <DashboardTable rows={rows} />}
    </>
  );
}

/** Tablero semaforizado de asistencia: cifras agregadas por estancia, sin datos identificables de infantes. */
export function ReportsPage() {
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [light, setLight] = useState<LightFilter>('TODOS');
  const [search, setSearch] = useState('');
  const query = useDashboard(date);

  return (
    <>
      <PageHeader eyebrow="Dirección" title="Reportes" description="Asistencia por estancia con semáforo, actualizada cada 30 segundos. Solo cifras agregadas: no se muestran datos de infantes." />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <Field label="Fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <Select label="Mostrar" value={light} onChange={(event) => setLight(event.target.value as LightFilter)}>
          <option value="TODOS">Todas</option>
          {TRAFFIC_LIGHTS.map((option) => (
            <option key={option} value={option}>
              {LIGHT_LABELS[option]}
            </option>
          ))}
        </Select>
        <Field label="Buscar estancia" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o clave" />
      </div>
      <ExportBar date={date} />
      {query.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Cargando tablero…</p> : null}
      {query.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo cargar el tablero.
        </p>
      ) : null}
      {query.data ? <DashboardBody data={query.data} light={light} search={search} /> : null}
    </>
  );
}
