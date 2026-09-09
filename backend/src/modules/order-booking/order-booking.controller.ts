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
import { OrderBookingDueHoldsDto } from './dto/order-booking-due-holds.dto';
import { OrderBookingInternalAuthGuard } from './order-booking-internal-auth.guard';
import { OrderBookingReadService } from './order-booking-read.service';

@ApiTags('internal-order-booking')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/order-booking')
@UseGuards(OrderBookingInternalAuthGuard)
export class OrderBookingController {
  constructor(private readonly orders: OrderBookingReadService) {}

  @Get('holds/due')
  @ApiOperation({ summary: 'فهرست خواندنی Holdهای سررسیدشده' })
  @ApiOkResponse({ description: 'صف محدود و بدون تغییر وضعیت Holdها' })
  @ApiBadRequestResponse({ description: 'زمان یا حد صف معتبر نیست.' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  async dueHolds(@Query() query: OrderBookingDueHoldsDto) {
    return {
      success: true,
      data: await this.orders.listDueHolds(query.asOf, query.limit),
    };
  }

  @Get('orders/:reference')
  @ApiOperation({ summary: 'وضعیت خواندنی و بدون PII یک سفارش' })
  @ApiOkResponse({ description: 'Order، سگمنت‌ها و تاریخچهٔ lifecycle' })
  @ApiBadRequestResponse({ description: 'مرجع سفارش معتبر نیست.' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiNotFoundResponse({ description: 'سفارش یافت نشد.' })
  async order(@Param('reference') reference: string) {
    return { success: true, data: await this.orders.getOrder(reference) };
  }
}
