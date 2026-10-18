import type { RosterEntry } from '@sirai/contracts';
import type { AttendanceStatus } from '@sirai/domain';

/** Qué pasó al leer un código (lector, cámara o captura manual) contra la lista del turno. */
export type ScanResult =
  | { readonly kind: 'marked' | 'already' | 'locked'; readonly entry: RosterEntry }
  | { readonly kind: 'unknown'; readonly code: string }
  | { readonly kind: 'empty' };

/** El lector puede traer espacios y la gente escribe en minúsculas: se compara sin eso. */
const normalize = (raw: string): string => raw.trim().toUpperCase();

/**
 * Busca la matrícula en la lista del turno. La matrícula es lo único que lleva
 * el código: ningún dato del menor viaja en él (supuesto del RF-13).
 */
export function classifyScan(entries: readonly RosterEntry[], raw: string, statusOf: (entry: RosterEntry) => AttendanceStatus | null): ScanResult {
  const code = normalize(raw);
  if (code === '') return { kind: 'empty' };
  const entry = entries.find((candidate) => normalize(candidate.enrollmentNumber) === code);
  if (!entry) return { kind: 'unknown', code: raw.trim() };
  if (entry.medicalLock) return { kind: 'locked', entry };
  return { kind: statusOf(entry) === 'PRESENTE' ? 'already' : 'marked', entry };
}

export interface ScanFeedback {
  readonly tone: 'ok' | 'warning';
  readonly text: string;
}

export function scanFeedback(result: ScanResult): ScanFeedback | null {
  switch (result.kind) {
    case 'empty':
      return null;
    case 'marked':
      return { tone: 'ok', text: `${result.entry.childName}: presente` };
    case 'already':
      return { tone: 'ok', text: `${result.entry.childName} ya estaba presente` };
    case 'locked':
      return { tone: 'warning', text: `${result.entry.childName} requiere alta médica: no se puede marcar presente.` };
    case 'unknown':
      return { tone: 'warning', text: `No hay un infante con la matrícula ${result.code} en este turno.` };
  }
}
