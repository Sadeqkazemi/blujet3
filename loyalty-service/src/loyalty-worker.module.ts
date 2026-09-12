import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import {
  loyaltyWorkerDataSourceOptions,
  validateLoyaltyWorkerEnv,
} from './loyalty-worker.config';
import { LoyaltyWorkerHealthController } from './loyalty-worker-health.controller';
import { LoyaltyKafkaRuntimeModule } from './projection/loyalty-kafka-runtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateLoyaltyWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        customProps: () => ({ service: 'blujet-loyalty-projection-worker' }),
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-internal-token',
          'req.body',
        ],
      },
    }),
    TypeOrmModule.forRoot({
      ...loyaltyWorkerDataSourceOptions(),
      retryAttempts: 0,
    }),
    LoyaltyKafkaRuntimeModule,
  ],
  controllers: [LoyaltyWorkerHealthController],
})
export class LoyaltyWorkerModule {}
