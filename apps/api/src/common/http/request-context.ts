import { isIPv4, isIPv6 } from 'node:net';
import type { Request } from 'express';

/** Petición con el id de correlación que asigna `requestIdMiddleware`. */
export interface RequestWithId extends Request {
  id?: string;
}

/** Datos de la petición que exige la auditoría (RNF-02). */
export interface RequestContext {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
}

const IPV6_GROUPS = 8;
const IPV4_MAPPED_PREFIX = '::ffff:';

/** Express expone IPv4 por IPv6 como `::ffff:1.2.3.4`; se normaliza. */
const normalizeIp = (ip: string): string =>
  ip.startsWith(IPV4_MAPPED_PREFIX) ? ip.slice(IPV4_MAPPED_PREFIX.length) : ip;

const packIpv4 = (ip: string): Buffer => Buffer.from(ip.split('.').map(Number));

const expandIpv6 = (ip: string): string[] => {
  const [head = '', tail = ''] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = IPV6_GROUPS - headGroups.length - tailGroups.length;
  return [...headGroups, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tailGroups];
};

const packIpv6 = (ip: string): Buffer => {
  const buffer = Buffer.alloc(IPV6_GROUPS * 2);
  expandIpv6(ip).forEach((group, index) => buffer.writeUInt16BE(parseInt(group, 16), index * 2));
  return buffer;
};

/** Empaqueta una IP como VARBINARY(16): 4 bytes IPv4 o 16 bytes IPv6. */
export function packIp(ip: string | null): Buffer | null {
  if (ip === null) return null;
  const normalized = normalizeIp(ip);
  if (isIPv4(normalized)) return packIpv4(normalized);
  if (isIPv6(normalized)) return packIpv6(normalized);
  return null;
}

export const extractRequestContext = (request: RequestWithId): RequestContext => ({
  ip: request.ip ? normalizeIp(request.ip) : null,
  userAgent: request.get('user-agent') ?? null,
  requestId: typeof request.id === 'string' ? request.id : null,
});
