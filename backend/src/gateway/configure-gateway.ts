import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from '../common/middleware/request-id.middleware';
import {
  DEFAULT_BODY_LIMIT_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  nonNegativeInteger,
  positiveInteger,
} from './gateway.constants';
import { RequestTimeoutInterceptor } from './request-timeout.interceptor';
import { apiVersionAlias } from './version-alias.middleware';

export function configureGateway(app: NestExpressApplication): void {
  const logger = app.get(Logger);
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: number | boolean): void;
  };
  const trustProxyHops = nonNegativeInteger(
    process.env.TRUST_PROXY_HOPS,
    process.env.NODE_ENV === 'production' ? 1 : 0,
  );
  express.set('trust proxy', trustProxyHops || false);

  // Registered before Nest routes and parsers: versioned aliases and request
  // correlation therefore cover successful responses and parser failures.
  app.use(apiVersionAlias);
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestIdMiddleware.use(req, res, next),
  );
  app.use(
    helmet({
      strictTransportSecurity:
        process.env.HTTPS_ENABLED === 'true' ? undefined : false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  const bodyLimit = positiveInteger(
    process.env.API_MAX_BODY_BYTES,
    DEFAULT_BODY_LIMIT_BYTES,
  );
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { extended: true, limit: bodyLimit });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(
    new RequestTimeoutInterceptor(
      positiveInteger(
        process.env.API_REQUEST_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS,
      ),
    ),
  );
  app.useGlobalFilters(new AllExceptionsFilter(logger));
}

export function configureHttpServerTimeouts(server: Server): void {
  const requestTimeout = positiveInteger(
    process.env.API_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  server.requestTimeout = requestTimeout + 5_000;
  server.headersTimeout = Math.min(server.requestTimeout, 15_000);
  server.keepAliveTimeout = 5_000;
}
