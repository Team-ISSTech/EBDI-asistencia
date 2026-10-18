interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export const detectorClass = (): BarcodeDetectorConstructor | undefined =>
  (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;

/** La cámara se ofrece solo donde el navegador sabe leer códigos; si no, quedan el lector y la captura manual. */
export const cameraSupported = (): boolean => detectorClass() !== undefined && Boolean(navigator.mediaDevices?.getUserMedia);
