import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import {
  opsAdminProjectionWorkerDataSourceOptions,
  validateOpsAdminProjectionWorkerEnv,
} from './config/ops-admin-projection-worker.config';
import { OpsAdminProjectionKafkaModule } from './modules/ops-admin/ops-admin-projection-kafka.module';
import { OpsAdminProjectionWorkerHealthController } from './ops-admin-projection-worker-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateOpsAdminProjectionWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        customProps: () => ({ service: 'blujet-ops-admin-projection' }),
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-internal-token',
          'req.body',
        ],
      },
    }),
    TypeOrmModule.forRoot(opsAdminProjectionWorkerDataSourceOptions()),
    OpsAdminProjectionKafkaModule,
  ],
  controllers: [OpsAdminProjectionWorkerHealthController],
})
export class OpsAdminProjectionWorkerModule {}
