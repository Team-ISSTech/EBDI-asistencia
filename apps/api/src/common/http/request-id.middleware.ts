import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from './request-context';

const HEADER = 'x-request-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Asigna un id de correlación por petición; respeta uno válido entrante. */
export function requestIdMiddleware(request: RequestWithId, response: Response, next: NextFunction): void {
  const incoming = request.get(HEADER);
  const id = incoming && UUID_PATTERN.test(incoming) ? incoming : randomUUID();
  request.id = id;
  response.setHeader(HEADER, id);
  next();
}
