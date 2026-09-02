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
        'WITH contact_contract AS (SELECT c."id" FROM "experience"."contact_messages" c LIMIT 0), blog_contract AS (SELECT b."authorName" FROM "experience"."blog_posts" b LIMIT 0), content_contract AS (SELECT b."key" FROM "experience"."site_content_blocks" b LIMIT 0), careers_contract AS (SELECT a."assigneeName" FROM "experience"."job_applications" a LIMIT 0), support_contract AS (SELECT t."forwardedToName" FROM "experience"."support_tickets" t LIMIT 0), survey_contract AS (SELECT i."flightNoSnapshot" FROM "experience"."survey_invites" i LIMIT 0) SELECT 1 FROM contact_contract, blog_contract, content_contract, careers_contract, support_contract, survey_contract LIMIT 0',
      );
      return {
        status: 'ok',
        service: 'blujet-experience',
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
        service: 'blujet-experience',
        database: 'down',
      });
    }
  }

  @Get('live')
  @Public()
  @ApiExcludeEndpoint()
  live() {
    return { status: 'ok', service: 'blujet-experience' };
  }

  @Get('ready')
  @Public()
  @ApiExcludeEndpoint()
  ready() {
    return this.check();
  }
}
