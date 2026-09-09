import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PaymentReconciliationListDto } from './dto/payment-reconciliation-list.dto';
import { PaymentReconciliationInternalAuthGuard } from './payment-reconciliation-internal-auth.guard';
import { PaymentReconciliationReadService } from './payment-reconciliation-read.service';

@ApiTags('internal-payment-reconciliation')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/payment-reconciliation')
@UseGuards(PaymentReconciliationInternalAuthGuard)
export class PaymentReconciliationController {
  constructor(private readonly payments: PaymentReconciliationReadService) {}

  @Get('pending')
  @ApiOperation({ summary: 'صف خواندنی مغایرت‌های پرداخت' })
  @ApiOkResponse({ description: 'موارد پرداخت موفقِ نیازمند تطبیق' })
  @ApiBadRequestResponse({ description: 'حد صف معتبر نیست.' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  async pending(@Query() query: PaymentReconciliationListDto) {
    return {
      success: true,
      data: await this.payments.listPending(query.limit),
    };
  }

  @Get('sagas/compensation-required')
  @ApiOperation({ summary: 'صف خواندنی Sagaهای نیازمند جبران' })
  @ApiOkResponse({ description: 'Sagaهای Core نیازمند اقدام جبرانی' })
  @ApiBadRequestResponse({ description: 'حد صف معتبر نیست.' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  async compensationRequired(@Query() query: PaymentReconciliationListDto) {
    return {
      success: true,
      data: await this.payments.listCompensationRequired(query.limit),
    };
  }

  @Get('orders/:reference/status')
  @ApiOperation({ summary: 'وضعیت پرداخت و لجر یک سفارش' })
  @ApiOkResponse({
    description: 'وضعیت خواندنی پرداخت بدون اطلاعات کارت یا PII',
  })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiNotFoundResponse({ description: 'سفارش یافت نشد.' })
  async status(@Param('reference') reference: string) {
    return { success: true, data: await this.payments.status(reference) };
  }
}
