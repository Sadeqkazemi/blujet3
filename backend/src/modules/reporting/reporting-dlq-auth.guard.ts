import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '../../common/errors';
import {
  REPORTING_DLQ_CONFIG,
  type ReportingDlqConfig,
} from '../../config/reporting-dlq.config';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class ReportingDlqAuthGuard implements CanActivate {
  constructor(
    @Inject(REPORTING_DLQ_CONFIG)
    private readonly config: ReportingDlqConfig,
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
