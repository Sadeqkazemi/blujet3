import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import {
  configureGateway,
  configureHttpServerTimeouts,
} from './gateway/configure-gateway';
import { TicketingRefundWorkerModule } from './ticketing-refund-worker.module';
import './common/bigint-json';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(
    TicketingRefundWorkerModule,
    { bufferLogs: true, bodyParser: false },
  );
  app.useLogger(app.get(Logger));
  configureGateway(app);
  app.enableShutdownHooks();
  const port = process.env.PORT ?? '3620';
  const server = await app.listen(port, '0.0.0.0');
  configureHttpServerTimeouts(server);
}

void bootstrap();
