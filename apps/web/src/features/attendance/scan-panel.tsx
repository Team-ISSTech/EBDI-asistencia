import { Button, Field } from '@sirai/ui';
import { type FormEvent, useRef, useState } from 'react';
import { CameraScanner } from './camera-scanner';
import { cameraSupported } from './camera-support';
import { type ScanResult, scanFeedback } from './scan';

export interface ScanPanelProps {
  readonly onScan: (code: string) => ScanResult;
}

/**
 * Captura por matrícula (RF-13). Un lector USB o Bluetooth escribe el código y
 * manda Enter, igual que quien lo teclea a mano; la cámara es opcional.
 */
export function ScanPanel({ onScan }: ScanPanelProps) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult>({ kind: 'empty' });
  const [cameraOpen, setCameraOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const feedback = scanFeedback(result);

  const handle = (raw: string) => setResult(onScan(raw));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    handle(code);
    setCode('');
    form.current?.querySelector('input')?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <form ref={form} onSubmit={submit} className="flex flex-wrap items-end gap-2" noValidate>
        <Field label="Escanear o escribir matrícula" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" />
        <Button type="submit" variant="ghost">
          Marcar
        </Button>
        {cameraSupported() && !cameraOpen ? (
          <Button type="button" variant="ghost" onClick={() => setCameraOpen(true)}>
            Usar la cámara
          </Button>
        ) : null}
      </form>
      {cameraOpen ? <CameraScanner onCode={handle} onClose={() => setCameraOpen(false)} /> : null}
      {feedback ? (
        <p role={feedback.tone === 'ok' ? 'status' : 'alert'} className={feedback.tone === 'ok' ? 'text-sm font-medium text-[var(--color-ink)]' : 'text-sm text-[var(--color-danger)]'}>
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
