import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { initSentry } from './common/sentry';
import {
  configureGateway,
  configureHttpServerTimeouts,
} from './gateway/configure-gateway';
import './common/bigint-json';

initSentry();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
    // Needed for HMAC verification of bank loan webhooks.
    rawBody: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  configureGateway(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('blujet API')
    .setDescription('blujet airline platform — internal API')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      'agency-api-key',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
  // Raw spec exported after every boot — single source of truth for
  // docs/API.md. Dev-repo convenience only: the production Docker image
  // has no docs/ directory (Swagger UI itself doesn't need this file), so
  // this must never crash the boot — best-effort only.
  try {
    fs.writeFileSync(
      path.join(__dirname, '..', '..', '..', 'docs', 'openapi.json'),
      JSON.stringify(document, null, 2),
    );
  } catch {
    logger.warn(
      'Skipped writing docs/openapi.json (not present in this environment)',
    );
  }
  // (__dirname resolves to backend/dist/src at runtime — three levels up reaches the repo root.)

  const server = await app.listen(process.env.PORT ?? 3000);
  configureHttpServerTimeouts(server);
  logger.log(`blujet backend listening on :${process.env.PORT ?? 3000}`);
}
void bootstrap();
