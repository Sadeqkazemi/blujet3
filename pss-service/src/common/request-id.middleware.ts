import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFromHeader(value: unknown): string {
  return typeof value === 'string' && VALID_REQUEST_ID.test(value)
    ? value
    : randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const pinoRequestId = (request as Request & { id?: string }).id;
    const requestId = requestIdFromHeader(
      request.header('x-request-id') ?? pinoRequestId,
    );
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
