import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ReportingKafkaRuntime } from './modules/reporting/reporting-kafka.runtime';
import { ReportingDlqStore } from './modules/reporting/reporting-dlq.store';
import {
  REPORTING_DLQ_CONFIG,
  type ReportingDlqConfig,
} from './config/reporting-dlq.config';

@ApiExcludeController()
@Controller()
export class ReportingWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: ReportingKafkaRuntime,
    private readonly dlq: ReportingDlqStore,
    @Inject(REPORTING_DLQ_CONFIG)
    private readonly dlqConfig: ReportingDlqConfig,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'blujet-reporting',
      version:
        process.env.SERVICE_VERSION ?? process.env.npm_package_version ?? 'dev',
      commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
    };
  }

  @Get('ready')
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-reporting',
        error: { database: { status: 'down' } },
      });
    }

    if (!this.runtime.isReady()) {
      const status = this.runtime.getStatus();
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-reporting',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: status.state },
        },
      });
    }

    let quarantine: { status: 'disabled' } | { status: 'up'; count: number } = {
      status: 'disabled',
    };
    if (this.dlqConfig.enabled) {
      try {
        quarantine = {
          status: 'up',
          count: await this.dlq.countQuarantined(),
        };
      } catch {
        throw new ServiceUnavailableException({
          status: 'error',
          service: 'blujet-reporting',
          error: {
            database: { status: 'up' },
            consumer: { status: 'up', state: this.runtime.getStatus().state },
            quarantine: { status: 'down' },
          },
        });
      }
    }

    return {
      status: 'ok',
      service: 'blujet-reporting',
      info: {
        database: { status: 'up' },
        consumer: { status: 'up', state: this.runtime.getStatus().state },
        quarantine,
      },
    };
  }
}
