import {
  CallHandler,
  ExecutionContext,
  GatewayTimeoutException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { ErrorCode } from '../common/errors';

@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error: unknown) => {
        if (!(error instanceof TimeoutError)) return throwError(() => error);
        return throwError(
          () =>
            new GatewayTimeoutException({
              code: ErrorCode.REQUEST_TIMEOUT,
              message:
                'زمان پاسخ‌گویی سرور به پایان رسید. لطفاً دوباره تلاش کنید.',
            }),
        );
      }),
    );
  }
}
