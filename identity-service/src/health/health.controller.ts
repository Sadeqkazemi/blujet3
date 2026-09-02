import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { IdentityKeyService } from '../keys/identity-key.service';
import { Public } from '../common/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly keys: IdentityKeyService) {}

  @Get()
  @Public()
  @ApiExcludeEndpoint()
  check() {
    return {
      status: 'ok',
      service: 'blujet-identity',
      version: process.env.SERVICE_VERSION ?? process.env.npm_package_version ?? 'dev',
      commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
      key: this.keys.getMetadata(),
    };
  }

  @Get('live')
  @Public()
  @ApiExcludeEndpoint()
  live() {
    return { status: 'ok', service: 'blujet-identity' };
  }

  @Get('ready')
  @Public()
  @ApiExcludeEndpoint()
  ready() {
    return this.check();
  }
}
