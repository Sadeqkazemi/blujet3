import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../common/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @ApiExcludeEndpoint()
  async check() {
    try {
      await this.dataSource.query(
        'WITH notification_contract AS (SELECT n."id" FROM "notify"."notifications" n LIMIT 0), sms_contract AS (SELECT s."sourceEventId" FROM "notify"."sms_logs" s LIMIT 0) SELECT 1 FROM notification_contract, sms_contract LIMIT 0',
      );
      return {
        status: 'ok',
        service: 'blujet-notify',
        version:
          process.env.SERVICE_VERSION ??
          process.env.npm_package_version ??
          'dev',
        commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
        database: 'up',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-notify',
        database: 'down',
      });
    }
  }

  @Get('live')
  @Public()
  @ApiExcludeEndpoint()
  live() {
    return { status: 'ok', service: 'blujet-notify' };
  }

  @Get('ready')
  @Public()
  @ApiExcludeEndpoint()
  ready() {
    return this.check();
  }
}
