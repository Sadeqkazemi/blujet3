import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import {
  opsAdminWorkerDataSourceOptions,
  validateOpsAdminWorkerEnv,
} from './config/ops-admin-worker.config';
import { OpsAdminModule } from './modules/ops-admin/ops-admin.module';
import { OpsAdminWorkerHealthController } from './ops-admin-worker-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateOpsAdminWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        customProps: () => ({ service: 'blujet-ops-admin' }),
        redact: ['req.headers.x-internal-token'],
      },
    }),
    TypeOrmModule.forRoot(opsAdminWorkerDataSourceOptions()),
    OpsAdminModule,
  ],
  controllers: [OpsAdminWorkerHealthController],
})
export class OpsAdminWorkerModule {}
