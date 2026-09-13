import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '../common/errors';
import {
  LOYALTY_DLQ_CONFIG,
  type LoyaltyDlqConfig,
} from '../loyalty-dlq.config';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class LoyaltyDlqAuthGuard implements CanActivate {
  constructor(
    @Inject(LOYALTY_DLQ_CONFIG)
    private readonly config: LoyaltyDlqConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const supplied = request.headers['x-internal-token'];
    if (
      !this.config.enabled ||
      typeof supplied !== 'string' ||
      !timingSafeEqual(digest(supplied), digest(this.config.operatorToken))
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'احراز هویت سرویس داخلی نامعتبر است.',
      });
    }
    return true;
  }
}
