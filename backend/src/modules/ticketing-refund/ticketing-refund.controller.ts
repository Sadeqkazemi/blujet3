import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { CoreItineraryRefundService } from '../pss/core-itinerary-refund.service';
import { CoreItineraryRetrievalService } from '../pss/core-itinerary-retrieval.service';
import {
  CoreOrderRetrievalQueryDto,
  CoreOrderRetrievalResponseDto,
} from '../pss/dto/core-order-retrieval.dto';
import {
  CoreItineraryRefundQuoteDto,
  QuoteCoreItineraryRefundDto,
  QuoteCoreItineraryRefundResponseDto,
} from '../pss/dto/core-itinerary-refund.dto';
import { TicketingRefundInternalAuthGuard } from './ticketing-refund-internal-auth.guard';

@ApiTags('internal-ticketing-refund')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/ticketing-refund/orders')
@UseGuards(TicketingRefundInternalAuthGuard)
export class TicketingRefundController {
  constructor(
    private readonly retrieval: CoreItineraryRetrievalService,
    private readonly refunds: CoreItineraryRefundService,
  ) {}

  @Get(':reference/status')
  @ApiOperation({ summary: 'وضعیت خواندنی بلیت و استرداد سفارش Core' })
  @ApiParam({ name: 'reference', description: 'شناسه سفارش یا PNR' })
  @ApiOkResponse({ type: CoreOrderRetrievalResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'مالک سفارش معتبر نیست.' })
  @ApiNotFoundResponse({ description: 'سفارش در محدوده مالک یافت نشد.' })
  async status(
    @Param('reference') reference: string,
    @Query() query: CoreOrderRetrievalQueryDto,
  ) {
    return {
      success: true,
      data: await this.retrieval.retrieve(reference, query.ownerId),
    };
  }

  @Post(':id/refund-quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'محاسبه خواندنی quote استرداد سفارش صادرشده' })
  @ApiParam({ name: 'id', description: 'شناسه داخلی سفارش' })
  @ApiOkResponse({ type: QuoteCoreItineraryRefundResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'شناسه مالک معتبر نیست.' })
  @ApiNotFoundResponse({ description: 'سفارش در محدوده مالک یافت نشد.' })
  @ApiConflictResponse({ description: 'سفارش یا شاهد مالی قابل quote نیست.' })
  async refundQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuoteCoreItineraryRefundDto,
  ): Promise<{ success: true; data: CoreItineraryRefundQuoteDto }> {
    return { success: true, data: await this.refunds.quote(id, dto) };
  }
}
