import type { ChildGuardian, FollowUp } from '@sirai/contracts';
import { Button, Card } from '@sirai/ui';
import { useSession } from '../auth/use-session';
import { PhoneCell } from '../children/guardian-row';
import { useChildGuardians } from '../children/use-guardians';
import { ContactForm } from './contact-form';
import { ContactHistory } from './contact-history';
import { ReleaseForm } from './release-form';
import { ApiClientError } from '../../lib/api-client';
import { useCloseFollowUp, useContacts, useRegisterContact, useRegisterRelease } from './use-follow-ups';

interface EmergencyContactsProps {
  readonly guardians: readonly ChildGuardian[];
  readonly canSeePhone: boolean;
}

/** RF-27: con dos intentos sin respuesta, a quién avisar; el teléfono se pide aparte y queda auditado. */
function EmergencyContacts({ guardians, canSeePhone }: EmergencyContactsProps) {
  const contacts = guardians.filter((guardian) => guardian.isEmergencyContact);
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-danger)]">Contactos de emergencia</h3>
      <p className="mb-2 text-sm text-[var(--color-text)]">No se localizó al tutor en dos intentos: avisa a estas personas.</p>
      {contacts.length === 0 ? <p className="text-sm">Este infante no tiene contactos de emergencia registrados.</p> : null}
      <ul className="flex flex-col gap-2">
        {contacts.map((guardian) => (
          <li key={guardian.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-[var(--color-ink)]">
              {guardian.name} {guardian.paternalSurname}
            </span>
            <span className="text-[var(--color-text-muted)]">{guardian.relationship}</span>
            {canSeePhone && guardian.hasPhone ? <PhoneCell guardianId={guardian.id} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ReleaseSectionProps {
  readonly followUp: FollowUp;
  readonly canRegister: boolean;
}

/** RF-30: el médico registra el alta; el resto ve que el caso la espera. */
function ReleaseSection({ followUp, canRegister }: ReleaseSectionProps) {
  const release = useRegisterRelease(followUp.id);
  if (!followUp.requiresMedicalRelease || followUp.medicalReleased) return null;
  if (!canRegister) return <p className="text-sm text-[var(--color-text-muted)]">Esperando el alta del médico de estancia.</p>;
  return <ReleaseForm pending={release.isPending} error={release.error} onSubmit={(body) => release.mutate(body)} />;
}

interface PanelHeaderProps {
  readonly title: string;
  readonly canClose: boolean;
  readonly closing: boolean;
  readonly closeError: unknown;
  readonly onCloseFollowUp: () => void;
  readonly onClosePanel: () => void;
}

/** Título y acciones del panel; el cierre del caso explica por qué falla si el servidor lo rechaza. */
function PanelHeader({ title, canClose, closing, closeError, onCloseFollowUp, onClosePanel }: PanelHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
        <div className="flex gap-2">
          {canClose ? (
            <Button variant="ghost" loading={closing} onClick={onCloseFollowUp}>
              Cerrar seguimiento
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClosePanel}>
            Cerrar
          </Button>
        </div>
      </div>
      {closeError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {closeError instanceof ApiClientError ? closeError.message : 'No se pudo cerrar el seguimiento.'}
        </p>
      ) : null}
    </>
  );
}

export interface ContactPanelProps {
  readonly followUp: FollowUp;
  readonly onClose: () => void;
}

/** Llamadas de un seguimiento: historial con notas, contactos de emergencia si hay alerta, registro de un intento, alta médica y cierre. */
export function ContactPanel({ followUp, onClose }: ContactPanelProps) {
  const { data: session } = useSession();
  const permissions = session?.permissions ?? [];
  const canReadNotes = permissions.includes('NOTA_SENSIBLE_CONSULTAR');
  const guardians = useChildGuardians(followUp.childId);
  const contacts = useContacts(followUp.id, canReadNotes);
  const register = useRegisterContact(followUp.id);
  const close = useCloseFollowUp(followUp.id);

  return (
    <Card className="mb-8 flex flex-col gap-4">
      <PanelHeader
        title={`Llamadas de ${followUp.childName}`}
        canClose={permissions.includes('SEGUIMIENTO_REGISTRAR')}
        closing={close.isPending}
        closeError={close.error}
        onCloseFollowUp={() => close.mutate()}
        onClosePanel={onClose}
      />
      <ReleaseSection followUp={followUp} canRegister={permissions.includes('ALTA_MEDICA_REGISTRAR')} />
      {followUp.emergencyAlert ? <EmergencyContacts guardians={guardians.data?.guardians ?? []} canSeePhone={canReadNotes} /> : null}
      {canReadNotes && contacts.data ? <ContactHistory contacts={contacts.data.contacts} /> : null}
      <ContactForm guardians={guardians.data?.guardians ?? []} pending={register.isPending} error={register.error} onSubmit={(body) => register.mutate(body)} />
    </Card>
  );
}
