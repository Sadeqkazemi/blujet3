import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

@Controller('health')
@SkipThrottle({
  default: true,
  sensitiveIp: true,
  sensitiveIdentity: true,
})
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  // Public, unauthenticated, rate-limit-exempt — used by Docker healthcheck + uptime monitoring.
  @Get()
  @ApiExcludeEndpoint()
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        info: {
          database: { status: 'up' },
          build: {
            status: 'up',
            version: process.env.npm_package_version ?? 'dev',
            commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
          },
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        error: { database: { status: 'down' } },
      });
    }
  }
}
