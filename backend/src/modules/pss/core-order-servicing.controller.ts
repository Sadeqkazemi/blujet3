import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CoreItineraryRefundService } from './core-itinerary-refund.service';
import {
  ApplyCoreItineraryRefundDto,
  ApplyCoreItineraryRefundResponseDto,
  QuoteCoreItineraryRefundDto,
  QuoteCoreItineraryRefundResponseDto,
} from './dto/core-itinerary-refund.dto';
import { PssInternalAuthGuard } from './pss-internal-auth.guard';

@ApiTags('internal-core-order-servicing')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/orders')
@UseGuards(PssInternalAuthGuard)
export class CoreOrderServicingController {
  constructor(private readonly refunds: CoreItineraryRefundService) {}

  @Post(':id/refunds/quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'محاسبه مبلغ استرداد کامل سفر صادرشده' })
  @ApiParam({ name: 'id', description: 'شناسه داخلی سفارش' })
  @ApiOkResponse({ type: QuoteCoreItineraryRefundResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'شناسه مالک معتبر نیست.' })
  @ApiNotFoundResponse({ description: 'سفارش در محدوده مالک یافت نشد.' })
  @ApiConflictResponse({ description: 'سفارش یا کوپن‌ها قابل استرداد نیستند.' })
  async quote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuoteCoreItineraryRefundDto,
  ) {
    const data = await this.refunds.quote(id, dto);
    return { success: true, data };
  }

  @Post(':id/refunds')
  @HttpCode(200)
  @ApiOperation({ summary: 'ثبت و اجرای استرداد کامل سفر به‌صورت اتمیک' })
  @ApiParam({ name: 'id', description: 'شناسه داخلی سفارش' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'کلید یکتای تکرار امن فرمان استرداد',
    required: true,
  })
  @ApiOkResponse({ type: ApplyCoreItineraryRefundResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({
    description: 'مالک، quote یا مرجع استرداد معتبر نیست.',
  })
  @ApiNotFoundResponse({ description: 'سفارش در محدوده مالک یافت نشد.' })
  @ApiConflictResponse({
    description:
      'درخواست تکراری متفاوت است یا استرداد برای تطبیق دستی نگه داشته شد.',
  })
  async apply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyCoreItineraryRefundDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.refunds.apply(id, dto, idempotencyKey);
    return { success: true, data };
  }
}
