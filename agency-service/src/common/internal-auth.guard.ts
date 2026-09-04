import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from './errors';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const supplied = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>().headers['x-internal-token'];
    const expected = this.config.getOrThrow<string>('AGENCY_INTERNAL_TOKEN');
    const digest = (value: string) =>
      createHash('sha256').update(value).digest();
    if (
      typeof supplied !== 'string' ||
      !timingSafeEqual(digest(supplied), digest(expected))
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'احراز هویت سرویس داخلی نامعتبر است.',
      });
    }
    return true;
  }
}
