import { CONTACT_CAUSES } from '@sirai/domain';
import { Badge, Card, EmptyState, PageHeader } from '@sirai/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmCard } from '../components/confirm-card';
import { STATUS_LABELS } from '../features/attendance/status';
import { CAUSE_LABELS } from '../features/follow-ups/labels';
import { useOffline } from './offline-api';
import type { ReviewItem } from './outbox';

const REVIEW_KEY = ['offline', 'review'] as const;
const RESULT_LABELS = { CONTACTADO: 'Contactado', SIN_RESPUESTA: 'Sin respuesta' } as const;

type AttendancePayload = Extract<NonNullable<ReviewItem['payload']>, { marks: unknown }>;
type ContactPayload = Extract<NonNullable<ReviewItem['payload']>, { contact: unknown }>;

function MarksDetail({ payload, item }: { readonly payload: AttendancePayload; readonly item: ReviewItem }) {
  const rejections = item.failure?.rejections ?? [];
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {payload.marks.map((mark) => {
        const rejected = rejections.find((rejection) => rejection.ref === mark.enrollmentId);
        return (
          <li key={mark.clientId}>
            <span>{`Infante n.º ${mark.enrollmentId}: ${STATUS_LABELS[mark.status]}`}</span>
            {rejected ? <p className="text-[var(--color-danger)]">{`No se aplicó: ${rejected.message}`}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function ContactDetail({ payload }: { readonly payload: ContactPayload }) {
  const { contact } = payload;
  const cause = contact.result === 'CONTACTADO' && (CONTACT_CAUSES as readonly string[]).includes(contact.cause) ? CAUSE_LABELS[contact.cause] : null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>{`Resultado: ${RESULT_LABELS[contact.result]}`}</p>
      {cause ? <p>{`Motivo: ${cause}`}</p> : null}
      {contact.result === 'CONTACTADO' ? <p>{`Regreso previsto: ${contact.expectedReturnDate}`}</p> : null}
      {contact.notes ? <p>{contact.notes}</p> : null}
    </div>
  );
}

function CaptureDetail({ item }: { readonly item: ReviewItem }) {
  const { payload } = item;
  if (payload === null) return <p className="text-sm text-[var(--color-text-muted)]">No se puede mostrar lo capturado.</p>;
  return 'marks' in payload ? <MarksDetail payload={payload} item={item} /> : <ContactDetail payload={payload} />;
}

function ReviewCard({ item, onDiscard }: { readonly item: ReviewItem; readonly onDiscard: () => void }) {
  return (
    <article>
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{item.type === 'ATTENDANCE_MARKS' ? 'Pase de lista' : 'Llamada de seguimiento'}</h2>
        <Badge tone={item.status === 'PARCIAL' ? 'accent' : 'danger'}>{item.status === 'PARCIAL' ? 'Se aplicó en parte' : 'No se aplicó nada'}</Badge>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{`Capturada el ${new Date(item.capturedAt).toLocaleString('es-MX')}`}</p>
      {item.failure?.message ? <p className="text-sm text-[var(--color-danger)]">{item.failure.message}</p> : null}
      <CaptureDetail item={item} />
      <button type="button" className="self-start text-sm font-medium text-[var(--color-ink)] underline underline-offset-4" aria-label="Descartar la captura revisada" onClick={onDiscard}>
        Descartar
      </button>
    </Card>
    </article>
  );
}

/**
 * Capturas que el servidor no pudo aplicar (S-20). Nada se pierde en silencio: aquí se ve
 * qué se capturó y por qué no entró, para reconciliarlo con el formato físico de respaldo.
 */
export function CaptureReviewPage() {
  const offline = useOffline();
  const items = useQuery({ queryKey: REVIEW_KEY, queryFn: () => offline.review() });
  const [discarding, setDiscarding] = useState<ReviewItem | null>(null);

  const confirmDiscard = async () => {
    if (!discarding) return;
    await offline.discard(discarding.operationId);
    setDiscarding(null);
    await items.refetch();
  };

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Capturas por revisar"
        description="Capturas hechas sin conexión que el servidor no pudo aplicar, del todo o en parte. Reconcíliarlas con el formato físico de respaldo y, cuando estén resueltas, descártalas."
      />
      {discarding ? (
        <ConfirmCard
          message="¿Descartar esta captura? Solo hazlo después de reconciliarla con el formato físico de respaldo: no se puede recuperar."
          confirmLabel="Confirmar descarte"
          cancelLabel="Cancelar descarte"
          pending={false}
          error={null}
          onConfirm={() => void confirmDiscard()}
          onCancel={() => setDiscarding(null)}
        />
      ) : null}
      {items.data?.length === 0 ? <EmptyState title="No hay capturas por revisar" description="Todo lo que se capturó sin conexión ya se aplicó." /> : null}
      <div className="flex flex-col gap-4">
        {(items.data ?? []).map((item) => (
          <ReviewCard key={item.operationId} item={item} onDiscard={() => setDiscarding(item)} />
        ))}
      </div>
    </>
  );
}
