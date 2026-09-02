import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ErrorCode } from '../../common/errors';
import { LoansService } from './loans.service';

@ApiTags('loans-webhooks')
@Controller('webhooks/bank-loans')
export class LoansWebhookController {
  constructor(private readonly loans: LoansService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'وب‌هوک امضاشده بانک برای وضعیت وام' })
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-bank-signature') signature: string | undefined,
  ) {
    const raw =
      req.rawBody ??
      Buffer.from(
        typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {}),
      );
    this.loans.verifyWebhookSignature(raw, signature);

    const body = (req.body ?? {}) as {
      eventId?: string;
      bankReferenceId?: string;
      status?: string;
      walletCreditIrr?: string;
      walletCreditReference?: string;
      occurredAt?: string;
      summary?: Record<string, unknown>;
    };
    if (!body.eventId || !body.bankReferenceId || !body.status) {
      throw new UnauthorizedException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'بدنه وب‌هوک ناقص است.',
      });
    }

    const data = await this.loans.handleWebhook({
      eventId: body.eventId,
      bankReferenceId: body.bankReferenceId,
      status: body.status,
      walletCreditIrr: body.walletCreditIrr,
      walletCreditReference: body.walletCreditReference,
      occurredAt: body.occurredAt,
      summary: body.summary,
    });
    return { success: true, data };
  }
}
