import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ReportingKafkaRuntime } from './modules/reporting/reporting-kafka.runtime';

@ApiExcludeController()
@Controller()
export class ReportingWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: ReportingKafkaRuntime,
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

    return {
      status: 'ok',
      service: 'blujet-reporting',
      info: {
        database: { status: 'up' },
        consumer: { status: 'up', state: this.runtime.getStatus().state },
      },
    };
  }
}
