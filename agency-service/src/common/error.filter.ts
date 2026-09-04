import {
  ArgumentsHost,
  Catch,
  HttpException,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from './errors';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const code =
      body && typeof body === 'object' && 'code' in body
        ? body.code
        : status === 400
          ? ErrorCode.VALIDATION_FAILED
          : status === 404
            ? ErrorCode.NOT_FOUND
            : ErrorCode.INTERNAL_ERROR;
    const message =
      body &&
      typeof body === 'object' &&
      'code' in body &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'درخواست قابل پردازش نیست.';
    response.status(status).json({ success: false, error: { code, message } });
  }
}
