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
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CoreItineraryService } from './core-itinerary.service';
import { CoreItineraryQuoteService } from './core-itinerary-quote.service';
import { CoreItineraryHoldService } from './core-itinerary-hold.service';
import { CoreItineraryCancelService } from './core-itinerary-cancel.service';
import { CoreItineraryPaymentService } from './core-itinerary-payment.service';
import {
  ConfirmCoreItineraryPaymentDto,
  ConfirmCoreItineraryPaymentResponseDto,
} from './dto/confirm-core-itinerary-payment.dto';
import {
  CancelCoreItineraryDto,
  CancelCoreItineraryResponseDto,
} from './dto/cancel-core-itinerary.dto';
import {
  HoldCoreItineraryDto,
  HoldCoreItineraryResponseDto,
} from './dto/hold-core-itinerary.dto';
import {
  QuoteCoreItineraryDto,
  QuoteCoreItineraryResponseDto,
} from './dto/quote-core-itinerary.dto';
import {
  ResolveCoreItineraryDto,
  ResolveCoreItineraryResponseDto,
} from './dto/resolve-core-itinerary.dto';
import { PssInternalAuthGuard } from './pss-internal-auth.guard';

/** Internal service-to-service route; never exposed as a public sales API. */
@ApiTags('internal-core-itinerary')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/core/itineraries')
@UseGuards(PssInternalAuthGuard)
export class CoreItineraryController {
  constructor(
    private readonly itineraries: CoreItineraryService,
    private readonly quotes: CoreItineraryQuoteService,
    private readonly holds: CoreItineraryHoldService,
    private readonly cancellations: CoreItineraryCancelService,
    private readonly payments: CoreItineraryPaymentService,
  ) {}

  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'اعتبارسنجی خواندنی سفر چندسگمنتی در Core' })
  @ApiOkResponse({ type: ResolveCoreItineraryResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'ترتیب یا پیوستگی سفر معتبر نیست.' })
  @ApiNotFoundResponse({
    description: 'پرواز، کابین یا کلاس نرخ قابل فروش نیست.',
  })
  @ApiConflictResponse({
    description: 'ظرفیت سگمنت یا کلاس نرخ تکمیل شده است.',
  })
  async resolve(@Body() dto: ResolveCoreItineraryDto) {
    const data = await this.itineraries.resolve(dto);
    return { success: true, data };
  }

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'قیمت‌گذاری جمعی سفر چندسگمنتی بدون ایجاد رزرو' })
  @ApiOkResponse({ type: QuoteCoreItineraryResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({
    description: 'ترتیب سفر، مسافران یا خدمات انتخابی معتبر نیست.',
  })
  @ApiNotFoundResponse({
    description: 'پرواز، کابین یا کلاس نرخ قابل فروش نیست.',
  })
  @ApiConflictResponse({ description: 'ظرفیت کل گروه موجود نیست.' })
  async quote(@Body() dto: QuoteCoreItineraryDto) {
    const data = await this.quotes.quote(dto);
    return { success: true, data };
  }

  @Post('hold')
  @HttpCode(201)
  @ApiOperation({ summary: 'ایجاد اتمیک یک PNR و hold برای همه سگمنت‌ها' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'کلید یکتای تکرار امن فرمان رزرو',
    required: true,
  })
  @ApiCreatedResponse({ type: HoldCoreItineraryResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({
    description: 'سفر، مسافران، خدمات یا کلید تکرار معتبر نیست.',
  })
  @ApiNotFoundResponse({
    description: 'پرواز، کابین یا کلاس نرخ قابل فروش نیست.',
  })
  @ApiConflictResponse({
    description: 'ظرفیت کافی نیست یا کلید تکرار با درخواست دیگری ثبت شده است.',
  })
  async hold(
    @Body() dto: HoldCoreItineraryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.holds.hold(dto, idempotencyKey);
    return { success: true, data };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'لغو idempotent یک hold چندسگمنتی' })
  @ApiParam({ name: 'id', description: 'شناسه داخلی سفارش' })
  @ApiOkResponse({ type: CancelCoreItineraryResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'شناسه مالک معتبر نیست.' })
  @ApiNotFoundResponse({ description: 'رزرو در محدوده مالک یافت نشد.' })
  @ApiConflictResponse({ description: 'وضعیت رزرو دیگر قابل لغو نیست.' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCoreItineraryDto,
  ) {
    const data = await this.cancellations.cancel(id, dto.ownerId);
    return { success: true, data };
  }

  @Post(':id/payment-confirmations')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ثبت شاهد پرداخت تأییدشده و صدور اتمیک بلیت چندسگمنتی',
  })
  @ApiParam({ name: 'id', description: 'شناسه داخلی سفارش' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'کلید یکتای تکرار امن تأیید پرداخت',
    required: true,
  })
  @ApiOkResponse({ type: ConfirmCoreItineraryPaymentResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({
    description: 'مالک، مبلغ، مرجع پرداخت یا کلید تکرار معتبر نیست.',
  })
  @ApiNotFoundResponse({ description: 'سفارش در محدوده مالک یافت نشد.' })
  @ApiConflictResponse({
    description:
      'درخواست تکراری متفاوت است یا پرداخت برای تطبیق دستی نگه داشته شد.',
  })
  async confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmCoreItineraryPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.payments.confirm(id, dto, idempotencyKey);
    return { success: true, data };
  }
}
