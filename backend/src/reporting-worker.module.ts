import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  reportingWorkerDataSourceOptions,
  validateReportingWorkerEnv,
} from './config/reporting-worker.config';
import { ReportingProjectionModule } from './modules/reporting/reporting-projection.module';
import { ReportingDlqAuthGuard } from './modules/reporting/reporting-dlq-auth.guard';
import { ReportingDlqController } from './modules/reporting/reporting-dlq.controller';
import { ReportingWorkerHealthController } from './reporting-worker-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateReportingWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        customProps: () => ({ service: 'blujet-reporting' }),
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-internal-token',
          'req.body',
        ],
      },
    }),
    TypeOrmModule.forRoot(reportingWorkerDataSourceOptions()),
    ReportingProjectionModule,
  ],
  controllers: [ReportingWorkerHealthController, ReportingDlqController],
  providers: [ReportingDlqAuthGuard],
})
export class ReportingWorkerModule {}
