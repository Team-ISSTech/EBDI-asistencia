import { performance } from 'node:perf_hooks';
import { type Summary, summarize } from './stats';

export interface Account {
  readonly cookie: string;
}

/** Par `nombre=valor` de la cookie de sesión que devolvió el login. */
export function cookieFrom(headers: Headers): string {
  const header = headers.getSetCookie()[0];
  if (!header) throw new Error('El login no entregó cookie de sesión.');
  return header.split(';')[0] ?? '';
}

interface Samples {
  latencies: number[];
  errors: number;
  firstError: string | null;
}

/** Cliente HTTP que mide cada petición por nombre de operación. */
export class LoadClient {
  private readonly samples = new Map<string, Samples>();

  constructor(private readonly baseUrl: string) {}

  /** Hace la petición, registra su duración y devuelve el cuerpo JSON (o null si falló o no es JSON). */
  async call(operation: string, method: 'GET' | 'POST', path: string, cookie: string | null, body?: object, expected: readonly number[] = [200, 201]): Promise<unknown> {
    const started = performance.now();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cookie) headers['cookie'] = cookie;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
      const text = await response.text();
      this.record(operation, performance.now() - started, expected.includes(response.status), `${response.status} ${text.slice(0, 120)}`);
      return response.ok && text ? (JSON.parse(text) as unknown) : null;
    } catch (error) {
      this.record(operation, performance.now() - started, false, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async login(operation: string, email: string, password: string): Promise<Account> {
    const started = performance.now();
    const response = await fetch(`${this.baseUrl}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    this.record(operation, performance.now() - started, response.ok, `${response.status}`);
    if (!response.ok) throw new Error(`Login fallido para ${email}: ${response.status}`);
    return { cookie: cookieFrom(response.headers) };
  }

  private record(operation: string, elapsed: number, ok: boolean, detail: string): void {
    const samples = this.samples.get(operation) ?? { latencies: [], errors: 0, firstError: null };
    if (ok) samples.latencies.push(elapsed);
    else {
      samples.errors += 1;
      samples.firstError ??= detail;
    }
    this.samples.set(operation, samples);
  }

  report(): Array<{ operation: string; summary: Summary; firstError: string | null }> {
    return [...this.samples.entries()].map(([operation, samples]) => ({ operation, summary: summarize(samples.latencies, samples.errors), firstError: samples.firstError }));
  }
}
