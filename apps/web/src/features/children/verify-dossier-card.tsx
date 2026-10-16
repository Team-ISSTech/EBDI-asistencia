import { Button, Card, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { useVerifyDossier } from './use-dossier';

const MISSING = 'Escribe el folio y el sello del expediente.';
const INVALID_FORMAT = 'El folio o el sello no tienen el formato de un expediente de SIRAI.';

const formatDate = (iso: string): string => new Date(iso).toLocaleString('es-MX');

/** Qué falla, si algo: datos faltantes, formato inválido (400) u otro error del servidor. */
const errorText = (missing: boolean, error: unknown): string | null => {
  if (missing) return MISSING;
  if (!error) return null;
  return error instanceof ApiClientError && error.status === 400 ? INVALID_FORMAT : 'No se pudo comprobar el expediente.';
};

interface ResultProps {
  readonly result: { readonly valid: true; readonly issuedAt: string; readonly originEstancia: string } | { readonly valid: false };
}

/** Auténtico o no; nunca muestra datos del infante. */
function Result({ result }: ResultProps) {
  if (!result.valid) {
    return (
      <p role="status" className="text-sm text-[var(--color-danger)]">
        El folio y el sello no coinciden con ningún expediente emitido.
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-[var(--color-success-text)]">
      <strong>Expediente auténtico</strong>: emitido el {formatDate(result.issuedAt)} en {result.originEstancia}.
    </p>
  );
}

/** Comprueba que un expediente recibido es auténtico; el resultado nunca revela datos del infante. */
export function VerifyDossierCard() {
  const [folio, setFolio] = useState('');
  const [seal, setSeal] = useState('');
  const [missing, setMissing] = useState(false);
  const verify = useVerifyDossier();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const incomplete = folio.trim() === '' || seal.trim() === '';
    setMissing(incomplete);
    if (!incomplete) verify.mutate({ folio: folio.trim(), seal: seal.trim() });
  };
  const message = errorText(missing, verify.error);

  return (
    <Card className="mb-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Verificar un expediente recibido</h2>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Folio" value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="EXP-2026-000042" />
        <Field label="Sello" value={seal} onChange={(e) => setSeal(e.target.value)} hint="Los 64 caracteres impresos en la última página." />
        {message ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {message}
          </p>
        ) : null}
        <Button type="submit" loading={verify.isPending} className="self-start">
          Comprobar
        </Button>
      </form>
      {verify.data ? <Result result={verify.data} /> : null}
    </Card>
  );
}
