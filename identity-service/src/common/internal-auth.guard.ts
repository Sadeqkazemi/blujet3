import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PUBLIC_ENDPOINT } from './public.decorator';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const supplied = request.headers['x-internal-token'];
    const expected = this.config.getOrThrow<string>('IDENTITY_INTERNAL_TOKEN');
    if (
      typeof supplied !== 'string' ||
      !timingSafeEqual(digest(supplied), digest(expected))
    ) {
      throw new UnauthorizedException({
        code: 'IDENTITY_INTERNAL_AUTH_REQUIRED',
        message: 'احراز هویت سرویس داخلی الزامی است.',
      });
    }
    return true;
  }
}
