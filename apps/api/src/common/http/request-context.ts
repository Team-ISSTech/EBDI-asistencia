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

const hex = (group: number): string => group.toString(16);

/** Compacta el tramo más largo de ceros de una IPv6 (`::`), como la escribe la gente. */
const compressIpv6 = (groups: readonly number[]): string => {
  let best = { start: -1, length: 0 };
  for (let start = 0; start < groups.length; start += 1) {
    let length = 0;
    while (groups[start + length] === 0) length += 1;
    if (length > best.length) best = { start, length };
  }
  if (best.length < 2) return groups.map(hex).join(':');
  const head = groups.slice(0, best.start).map(hex).join(':');
  const tail = groups.slice(best.start + best.length).map(hex).join(':');
  return `${head}::${tail}`;
};

/** Inverso de `packIp`: el texto de una IP guardada como VARBINARY(16). Lo que no sea 4 o 16 bytes es nulo. */
export function unpackIp(packed: Buffer | null): string | null {
  if (packed === null) return null;
  if (packed.length === 4) return [...packed].join('.');
  if (packed.length !== IPV6_GROUPS * 2) return null;
  return compressIpv6(Array.from({ length: IPV6_GROUPS }, (_, index) => packed.readUInt16BE(index * 2)));
}

export const extractRequestContext = (request: RequestWithId): RequestContext => ({
  ip: request.ip ? normalizeIp(request.ip) : null,
  userAgent: request.get('user-agent') ?? null,
  requestId: typeof request.id === 'string' ? request.id : null,
});
