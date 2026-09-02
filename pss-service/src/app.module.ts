import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { InternalAuthGuard } from './common/internal-auth.guard';
import {
  RequestIdMiddleware,
  requestIdFromHeader,
} from './common/request-id.middleware';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ReliabilityModule } from './reliability/reliability.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

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
        customProps: (request) => ({ requestId: request.id }),
        redact: [
          'req.headers.x-internal-token',
          'req.headers.authorization',
          'req.body.nationalId',
          'req.body.passportNumber',
        ],
      },
    }),
    DatabaseModule,
    ReliabilityModule,
    ReconciliationModule,
    HealthModule,
    CapabilitiesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: InternalAuthGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
