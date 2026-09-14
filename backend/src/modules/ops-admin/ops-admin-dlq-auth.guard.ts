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
  OPS_ADMIN_DLQ_CONFIG,
  type OpsAdminDlqConfig,
} from '../../config/ops-admin-dlq.config';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class OpsAdminDlqAuthGuard implements CanActivate {
  constructor(
    @Inject(OPS_ADMIN_DLQ_CONFIG)
    private readonly config: OpsAdminDlqConfig,
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
