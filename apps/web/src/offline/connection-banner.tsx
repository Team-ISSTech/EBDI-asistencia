import { Button } from '@sirai/ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { type OfflineApi, useOfflineOptional } from './offline-api';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

interface Line {
  readonly key: string;
  readonly content: ReactNode;
}

/** Los avisos que corresponden al estado de la conexión y de la cola, en el orden en que conviene leerlos. */
function linesFor({ online, counts, syncing, syncNow, staleData }: OfflineApi): Line[] {
  const lines: Line[] = [];
  if (!online) lines.push({ key: 'offline', content: 'Sin conexión. Lo que captures se guarda en esta tablet y se enviará solo cuando vuelva la conexión.' });
  if (staleData) lines.push({ key: 'stale', content: 'Mostrando datos guardados en esta tablet; pueden no estar al día.' });
  if (syncing && counts.pending > 0) lines.push({ key: 'syncing', content: 'Enviando capturas…' });
  else if (counts.pending > 0) {
    lines.push({
      key: 'pending',
      content: (
        <>
          {plural(counts.pending, 'captura pendiente', 'capturas pendientes')} de enviar.{' '}
          {online ? (
            <Button variant="ghost" onClick={() => void syncNow()}>
              Enviar ahora
            </Button>
          ) : null}
        </>
      ),
    });
  }
  if (counts.review > 0) {
    lines.push({
      key: 'review',
      content: (
        <>
          {plural(counts.review, 'captura requiere', 'capturas requieren')} revisión.{' '}
          <Link to="/app/capturas" className="font-medium underline underline-offset-4">
            Revisar
          </Link>
        </>
      ),
    });
  }
  if (counts.others > 0) {
    lines.push({ key: 'others', content: `Hay ${plural(counts.others, 'captura', 'capturas')} de otra persona en esta tablet; se enviarán cuando inicie sesión.` });
  }
  return lines;
}

/**
 * Estado de la conexión y de lo guardado en la tablet (RF-20 a RF-23). La persona
 * siempre sabe si lo que captura ya llegó al servidor o espera a que vuelva la conexión.
 */
export function ConnectionBanner() {
  const offline = useOfflineOptional();
  if (!offline) return null;
  const lines = linesFor(offline);
  if (lines.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="mb-6 flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-ink)]">
      {lines.map((line) => (
        <p key={line.key}>{line.content}</p>
      ))}
    </div>
  );
}
