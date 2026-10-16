import type { DownloadedFile } from './api-client';

/** Entrega un archivo descargado al navegador como una descarga con su nombre. */
export function saveDownload({ blob, filename }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
