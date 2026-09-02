import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Logger } from 'nestjs-pino';
import { ErrorCode } from '../errors';
import { Sentry } from '../sentry';

const FALLBACK_MESSAGE = 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.';

/** Central error handler — never leaks stack traces; always returns the API envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const parserStatus = this.parserErrorStatus(exception);
    const status = isHttp
      ? exception.getStatus()
      : (parserStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const { code, message } = this.resolveBody(exception, isHttp, status);

    const trace = exception instanceof Error ? exception.stack : undefined;
    if (status >= 500) {
      this.logger.error(
        `Unhandled exception: ${code}`,
        trace,
        AllExceptionsFilter.name,
      );
      // No-op when SENTRY_DSN is unset — Sentry.init() was never called.
      Sentry.captureException(exception);
    } else {
      this.logger.warn(`Handled exception: ${code}`, AllExceptionsFilter.name);
    }

    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }

  private resolveBody(exception: unknown, isHttp: boolean, status: number) {
    if (status === 413) {
      return {
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'حجم درخواست بیشتر از حد مجاز است.',
      };
    }
    if (!isHttp) {
      return { code: ErrorCode.INTERNAL_ERROR, message: FALLBACK_MESSAGE };
    }

    const body = (exception as HttpException).getResponse();
    if (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      'message' in body
    ) {
      return body as { code: string; message: string };
    }

    const fallbackByStatus: Record<number, ErrorCode> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
      [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
      [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
      [HttpStatus.GATEWAY_TIMEOUT]: ErrorCode.REQUEST_TIMEOUT,
    };

    const message =
      typeof body === 'string'
        ? body
        : ((body as { message?: string })?.message ?? FALLBACK_MESSAGE);

    return {
      code: fallbackByStatus[status] ?? ErrorCode.INTERNAL_ERROR,
      message,
    };
  }

  private parserErrorStatus(exception: unknown): number | undefined {
    if (typeof exception !== 'object' || exception === null) return undefined;
    const error = exception as { status?: unknown; type?: unknown };
    if (error.status === HttpStatus.PAYLOAD_TOO_LARGE) {
      return HttpStatus.PAYLOAD_TOO_LARGE;
    }
    if (error.type === 'entity.too.large') {
      return HttpStatus.PAYLOAD_TOO_LARGE;
    }
    return undefined;
  }
}
