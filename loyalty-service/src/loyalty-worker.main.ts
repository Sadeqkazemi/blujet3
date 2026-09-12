import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { LoyaltyWorkerModule } from './loyalty-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(LoyaltyWorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3510, '0.0.0.0');
}

void bootstrap();
