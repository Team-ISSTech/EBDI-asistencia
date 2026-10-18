import type { AttendanceJourney } from '@sirai/contracts';
import type { Shift } from '@sirai/domain';
import { Button, EmptyState } from '@sirai/ui';
import { useSession } from '../auth/use-session';
import { ScanPanel, type ScanPanelProps } from './scan-panel';
import { RosterTable } from './roster-table';
import { useAttendanceDraft } from './use-attendance-draft';
import { useCloseJourney, useMarkAttendance, useRoster } from './use-attendance';

interface ActionsProps {
  readonly canMark: boolean;
  readonly canClose: boolean;
  readonly pendingCount: number;
  readonly saving: boolean;
  readonly closing: boolean;
  readonly onMarkAll: () => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
}

/** Los botones que se ven dependen de los permisos de la sesión. */
function Actions({ canMark, canClose, pendingCount, saving, closing, onMarkAll, onSave, onClose }: ActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {canMark ? (
        <>
          <Button variant="ghost" onClick={onMarkAll}>
            Marcar a todos presentes
          </Button>
          <Button disabled={pendingCount === 0} loading={saving} onClick={onSave}>
            Guardar asistencia
          </Button>
        </>
      ) : null}
      {canClose ? (
        <Button variant="ghost" loading={closing} onClick={onClose}>
          Cerrar jornada
        </Button>
      ) : null}
    </div>
  );
}

/** Solo quien registra asistencia captura por matrícula. */
function ScanTools({ canMark, onScan }: { readonly canMark: boolean; readonly onScan: ScanPanelProps['onScan'] }) {
  return canMark ? <ScanPanel onScan={onScan} /> : null;
}

export interface JourneyPanelProps {
  readonly journey: AttendanceJourney;
  readonly date: string;
  readonly shift: Shift;
}

/** Lista de una jornada abierta: captura rápida para quien registra, solo lectura para el resto. */
export function JourneyPanel({ journey, date, shift }: JourneyPanelProps) {
  const { data: session } = useSession();
  const roster = useRoster(journey.id);
  const entries = roster.data?.entries ?? [];
  const draft = useAttendanceDraft(entries);
  const save = useMarkAttendance(journey.id);
  const close = useCloseJourney(date, shift);
  const permissions = session?.permissions ?? [];
  const canMark = permissions.includes('ASISTENCIA_REGISTRAR');
  const pending = draft.pending();

  if (roster.isPending) return <p className="text-sm text-[var(--color-text-muted)]">Cargando lista…</p>;
  if (roster.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        No se pudo cargar la lista de asistencia.
      </p>
    );
  }
  if (entries.length === 0) {
    return <EmptyState title="Sin infantes en este turno" description="No hay infantes inscritos en salas de este turno." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Actions
        canMark={canMark}
        canClose={permissions.includes('JORNADA_CERRAR')}
        pendingCount={pending.length}
        saving={save.isPending}
        closing={close.isPending}
        onMarkAll={draft.markAllPresent}
        onSave={() => save.mutate({ marks: pending }, { onSuccess: draft.clear })}
        onClose={() => close.mutate(journey.id)}
      />
      {save.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo guardar la asistencia. Lo marcado sigue en pantalla; intenta de nuevo.
        </p>
      ) : null}
      <ScanTools canMark={canMark} onScan={draft.scan} />
      <RosterTable entries={entries} statusOf={draft.statusOf} {...(canMark ? { onSelect: draft.setStatus } : {})} />
    </div>
  );
}
