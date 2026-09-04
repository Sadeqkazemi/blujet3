import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '../../common/errors';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class PssInternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const supplied = request.headers['x-internal-token'];
    const expected = this.config.get<string>('PSS_INTERNAL_TOKEN');
    if (
      typeof supplied !== 'string' ||
      !expected ||
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
