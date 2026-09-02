import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { InternalAuthGuard } from './common/internal-auth.guard';
import {
  RequestIdMiddleware,
  requestIdFromHeader,
} from './common/request-id.middleware';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { EventsModule } from './events/events.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SmsModule } from './sms/sms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        genReqId: (request) =>
          requestIdFromHeader(request.headers['x-request-id']),
        customProps: (request) => ({
          requestId: request.id,
          service: 'blujet-notify',
        }),
        redact: [
          'req.headers.x-internal-token',
          'req.headers.authorization',
          'req.body.payloadEncrypted',
          'req.body.phone',
          'req.body.message',
        ],
      },
    }),
    DatabaseModule,
    NotificationsModule,
    SmsModule,
    EventsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: InternalAuthGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
