import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { OpsAdminKafkaRuntime } from './modules/ops-admin/ops-admin-kafka.runtime';

@ApiExcludeController()
@Controller()
export class OpsAdminProjectionWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: OpsAdminKafkaRuntime,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'blujet-ops-admin-projection',
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
        service: 'blujet-ops-admin-projection',
        error: { database: { status: 'down' } },
      });
    }

    const consumer = this.runtime.getStatus();
    if (!this.runtime.isReady()) {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: consumer.state },
        },
      });
    }

    return {
      status: 'ok',
      service: 'blujet-ops-admin-projection',
      info: {
        database: { status: 'up' },
        consumer: { status: 'up', state: consumer.state },
      },
    };
  }
}
