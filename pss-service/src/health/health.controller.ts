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
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        service: 'blujet-pss',
        database: 'up',
        version: process.env.npm_package_version ?? 'dev',
        commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-pss',
        database: 'down',
      });
    }
  }

  @Get('live')
  @Public()
  @ApiExcludeEndpoint()
  live() {
    return { status: 'ok', service: 'blujet-pss' };
  }

  @Get('ready')
  @Public()
  @ApiExcludeEndpoint()
  async ready() {
    return this.check();
  }
}
