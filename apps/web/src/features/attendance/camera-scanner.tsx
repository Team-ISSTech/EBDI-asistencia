import { Button } from '@sirai/ui';
import { useEffect, useRef, useState } from 'react';
import { detectorClass } from './camera-support';

const POLL_MS = 300;
/** El mismo código frente a la cámara no se reenvía en este tiempo. */
const REPEAT_MS = 2500;


export interface CameraScannerProps {
  readonly onCode: (code: string) => void;
  readonly onClose: () => void;
}

/** Vista de la cámara trasera que lee QR y códigos de barras; apaga la cámara al cerrarse. */
export function CameraScanner({ onCode, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stream: MediaStream | undefined;
    const last = { code: '', at: 0 };

    const start = async () => {
      const Detector = detectorClass();
      if (!Detector) throw new Error('Sin BarcodeDetector');
      const detector = new Detector();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await Promise.resolve(video.play()).catch(() => undefined);
      }
      timer = setInterval(() => {
        if (!video) return;
        void detector.detect(video).then((codes) => {
          const code = codes[0]?.rawValue;
          if (!code || cancelled || (code === last.code && Date.now() - last.at < REPEAT_MS)) return;
          last.code = code;
          last.at = Date.now();
          handler.current(code);
        }).catch(() => undefined);
      }, POLL_MS);
    };

    start().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo abrir la cámara. Usa el lector o escribe la matrícula.
        </p>
      ) : (
        <video ref={videoRef} muted playsInline className="max-h-64 w-full max-w-sm rounded-md bg-black" aria-label="Vista de la cámara" />
      )}
      <Button variant="ghost" className="self-start" onClick={onClose}>
        Cerrar la cámara
      </Button>
    </div>
  );
}
