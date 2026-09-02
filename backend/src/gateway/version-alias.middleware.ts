import type { NextFunction, Request, Response } from 'express';
import { API_V1_PREFIX } from './gateway.constants';

/**
 * Makes `/api/v1` canonical without duplicating hundreds of controllers.
 * Express keeps `originalUrl`, so logs and tracing still show the client path.
 */
export function apiVersionAlias(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.url === API_V1_PREFIX) {
    req.url = '/';
  } else if (req.url.startsWith(`${API_V1_PREFIX}/`)) {
    req.url = req.url.slice(API_V1_PREFIX.length);
  }
  next();
}
