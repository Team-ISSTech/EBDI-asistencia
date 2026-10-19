import type { PurgeSchoolYearResponse, SchoolYearView } from '@sirai/contracts';
import { Button, Card, Field } from '@sirai/ui';
import { useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { useSchoolYearActions } from './use-school-years';

export interface PurgeYearCardProps {
  readonly year: SchoolYearView;
  readonly onDone: (result: PurgeSchoolYearResponse) => void;
  readonly onCancel: () => void;
}

const serverMessage = (error: unknown): string | null => {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : 'No se pudo depurar el ciclo.';
};

/**
 * Depurar vacía datos sensibles y no se deshace, así que no basta un clic: hay
 * que escribir la clave del ciclo. Las filas y los conteos se conservan.
 */
export function PurgeYearCard({ year, onDone, onCancel }: PurgeYearCardProps) {
  const { purge } = useSchoolYearActions();
  const [typed, setTyped] = useState('');
  const failure = serverMessage(purge.error);

  return (
    <Card className="mb-8 flex flex-col gap-3 border-[var(--color-danger)]">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Depurar el ciclo {year.code}</h2>
      <p className="text-sm text-[var(--color-text)]">
        Se vaciarán los teléfonos, notas de asesoría y observaciones médicas cifrados de los seguimientos de este ciclo. <strong>Esto no se puede deshacer.</strong> Los registros, los conteos y la bitácora se conservan.
      </p>
      <Field label="Escribe la clave del ciclo para confirmar" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      {failure ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {failure}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="danger"
          loading={purge.isPending}
          disabled={typed.trim() !== year.code}
          onClick={() => purge.mutate({ id: year.id, body: { confirmCode: typed.trim() } }, { onSuccess: onDone })}
        >
          Confirmar depuración
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar depuración
        </Button>
      </div>
    </Card>
  );
}
