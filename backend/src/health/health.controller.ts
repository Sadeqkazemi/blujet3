import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { ReportingKafkaRuntime } from '../modules/reporting/reporting-kafka.runtime';

@Controller('health')
@SkipThrottle({
  default: true,
  sensitiveIp: true,
  sensitiveIdentity: true,
})
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reportingRuntime: ReportingKafkaRuntime,
  ) {}

  private reportingInfo() {
    const status = this.reportingRuntime.getStatus();
    return {
      status: this.reportingRuntime.isReady() ? 'up' : 'down',
      enabled: status.enabled,
      state: status.state,
      processingFailures: status.processingFailures,
      lastProcessingFailureAt: status.lastProcessingFailureAt,
      lastMessageAt: status.lastMessageAt,
      lastProcessedAt: status.lastProcessedAt,
      checkpointPartitions: status.checkpointPartitions,
      maxObservedLag: status.maxObservedLag,
      lastCheckpointAt: status.lastCheckpointAt,
    };
  }

  // Public, unauthenticated, rate-limit-exempt — used by Docker healthcheck + uptime monitoring.
  @Get()
  @ApiExcludeEndpoint()
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        service: 'blujet-backend',
        info: {
          database: { status: 'up' },
          build: {
            status: 'up',
            version:
              process.env.SERVICE_VERSION ??
              process.env.npm_package_version ??
              'dev',
            commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
          },
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-backend',
        error: { database: { status: 'down' } },
      });
    }
  }

  @Get('ready')
  @ApiExcludeEndpoint()
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-backend',
        error: {
          database: { status: 'down' },
          reporting: this.reportingInfo(),
        },
      });
    }

    const reporting = this.reportingInfo();
    if (reporting.status === 'down') {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-backend',
        error: {
          database: { status: 'up' },
          reporting,
        },
      });
    }

    return {
      status: 'ok',
      service: 'blujet-backend',
      info: {
        database: { status: 'up' },
        reporting,
      },
    };
  }
}
