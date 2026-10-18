import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;

/**
 * Límite de peticiones por minuto de cada sistema (RF-37), en ventana fija.
 * Vive en la memoria del proceso: con varias réplicas de la API cada una cuenta
 * lo suyo, así que el tope real es el límite por el número de réplicas.
 */
@Injectable()
export class SystemRateLimiter {
  private readonly windows = new Map<number, { window: number; count: number }>();

  /** `true` si esta petición cabe en el minuto en curso; cuenta la petición. */
  allow(systemId: number, limit: number, now: Date): boolean {
    const window = Math.floor(now.getTime() / WINDOW_MS);
    const current = this.windows.get(systemId);
    const count = current?.window === window ? current.count + 1 : 1;
    this.windows.set(systemId, { window, count });
    this.evictOldWindows(window);
    return count <= limit;
  }

  /** Quita los sistemas que no han llamado en este minuto, para que el mapa no crezca sin límite. */
  private evictOldWindows(window: number): void {
    if (this.windows.size < 1000) return;
    for (const [id, entry] of this.windows) if (entry.window < window) this.windows.delete(id);
  }
}
