import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { databaseOptions, validateEnv } from './config';
import { ErrorFilter } from './common/error.filter';
import { InternalAuthGuard } from './common/internal-auth.guard';
import {
  RequestIdMiddleware,
  requestIdFromHeader,
} from './common/request-id.middleware';
import { HealthController } from './health.controller';
import { AgencyController } from './agency/agency.controller';
import { AgencyService } from './agency/agency.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        genReqId: (req) => requestIdFromHeader(req.headers['x-request-id']),
        customProps: (req) => ({
          service: 'blujet-agency',
          requestId: req.id,
        }),
        serializers: {
          req: (req: { method: string }) => ({ method: req.method }),
        },
        redact: [
          'req.headers.authorization',
          'req.headers.x-internal-token',
          'req.headers.cookie',
        ],
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...databaseOptions(config.getOrThrow<string>('AGENCY_DATABASE_URL')),
        retryAttempts: 0,
      }),
    }),
  ],
  controllers: [AgencyController, HealthController],
  providers: [
    AgencyService,
    InternalAuthGuard,
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
