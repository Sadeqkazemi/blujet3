import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureGateway } from '../../src/gateway/configure-gateway';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<
    NestExpressApplication & INestApplication<App>
  >({
    bufferLogs: true,
    bodyParser: false,
    rawBody: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureGateway(app);
  await app.init();
  return app;
}
