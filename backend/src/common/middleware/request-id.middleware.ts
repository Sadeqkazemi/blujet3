import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { requestIdFromHeader } from '../../gateway/request-id';

const HEADER = 'x-request-id';

/** Assigns/propagates a request ID: logged on every line for this request, echoed back to the client. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = requestIdFromHeader(req.headers[HEADER]);
    req.headers[HEADER] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
