/** Largo mínimo de cualquier contraseña (RF-38); la temporal que fija el administrador lo cumple igual. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'MUY_CORTA' | 'IGUAL_A_LA_ACTUAL' };

/** Política mínima de una contraseña nueva: largo suficiente y distinta de la actual. */
export function checkNewPassword(next: string, current: string): PasswordCheck {
  if (next.trim().length < PASSWORD_MIN_LENGTH) return { ok: false, reason: 'MUY_CORTA' };
  if (next === current) return { ok: false, reason: 'IGUAL_A_LA_ACTUAL' };
  return { ok: true };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Fecha en que caduca una contraseña temporal emitida en `issuedAt`. */
export const temporaryPasswordExpiry = (issuedAt: Date, days: number): Date => new Date(issuedAt.getTime() + days * MS_PER_DAY);

/** Una contraseña temporal sin fecha no caduca; con fecha, caduca al llegar a ella. */
export const isTemporaryPasswordExpired = (expiresAt: Date | null, now: Date): boolean => expiresAt !== null && expiresAt <= now;
