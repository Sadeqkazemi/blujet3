import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('blujet experience internal API')
        .setVersion('0.1')
        .addApiKey(
          { type: 'apiKey', in: 'header', name: 'X-Internal-Token' },
          'internal-token',
        )
        .build(),
    );
    SwaggerModule.setup('internal/docs', app, document);
  }
  await app.listen(process.env.PORT ?? 3300, '0.0.0.0');
}

void bootstrap();
