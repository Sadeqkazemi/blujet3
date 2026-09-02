import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestIdFromHeader(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9._-]{1,128}$/.test(candidate)
    ? candidate
    : randomUUID();
}

export class RequestIdMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = requestIdFromHeader(request.headers['x-request-id']);
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
