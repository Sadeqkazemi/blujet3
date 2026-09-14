import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { APP_FILTER } from '@nestjs/core';
import { ErrorFilter } from './common/error.filter';
import {
  agencyWorkerDataSourceOptions,
  validateAgencyWorkerEnv,
} from './agency-worker.config';
import { AgencyWorkerHealthController } from './agency-worker-health.controller';
import { AgencyKafkaRuntimeModule } from './projection/agency-kafka-runtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAgencyWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        customProps: () => ({ service: 'blujet-agency-projection-worker' }),
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-internal-token',
          'req.body',
        ],
      },
    }),
    TypeOrmModule.forRoot({
      ...agencyWorkerDataSourceOptions(),
      retryAttempts: 0,
    }),
    AgencyKafkaRuntimeModule,
  ],
  controllers: [AgencyWorkerHealthController],
  providers: [{ provide: APP_FILTER, useClass: ErrorFilter }],
})
export class AgencyWorkerModule {}
