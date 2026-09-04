import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestIdFromHeader(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, 128)
    : randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = requestIdFromHeader(request.headers['x-request-id']);
    request.id = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
