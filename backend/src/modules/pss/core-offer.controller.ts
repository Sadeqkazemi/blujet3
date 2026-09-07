import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
import { CoreOfferService } from './core-offer.service';
import {
  CoreOfferRepriceDto,
  CoreOfferRepriceResponseDto,
  CoreOfferResponseDto,
  CoreOfferHoldDto,
  CoreOfferHoldResponseDto,
  CoreOfferSearchDto,
} from './dto/core-offer.dto';
import { PssInternalAuthGuard } from './pss-internal-auth.guard';

/** Internal Core route; never exposed as a public sales endpoint. */
@ApiTags('internal-core-offers')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/offers')
@UseGuards(PssInternalAuthGuard)
export class CoreOfferController {
  constructor(private readonly offers: CoreOfferService) {}

  @Post('search')
  @HttpCode(200)
  @ApiOperation({ summary: 'ایجاد Offer امضاشده و کوتاه‌عمر از قیمت Core' })
  @ApiOkResponse({ type: CoreOfferResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'ورودی سفر یا مالک معتبر نیست.' })
  @ApiNotFoundResponse({ description: 'پرواز یا نرخ قابل فروش نیست.' })
  @ApiConflictResponse({ description: 'ظرفیت کابین کافی نیست.' })
  @ApiServiceUnavailableResponse({
    description: 'کلید امضای Offer تنظیم نشده است.',
  })
  async search(@Body() dto: CoreOfferSearchDto) {
    return { success: true, data: await this.offers.search(dto) };
  }

  @Post(':offerId/reprice')
  @HttpCode(200)
  @ApiOperation({ summary: 'بازقیمت‌گذاری Offer با اعتبارسنجی امضا و انقضا' })
  @ApiParam({ name: 'offerId', description: 'شناسهٔ Offer' })
  @ApiOkResponse({ type: CoreOfferRepriceResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({ description: 'درخواست بازقیمت‌گذاری معتبر نیست.' })
  @ApiNotFoundResponse({ description: 'پرواز یا نرخ دیگر قابل فروش نیست.' })
  @ApiConflictResponse({
    description: 'Offer منقضی، دست‌کاری یا متعلق به فروشندهٔ دیگری است.',
  })
  @ApiServiceUnavailableResponse({
    description: 'کلید امضای Offer تنظیم نشده است.',
  })
  async reprice(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: CoreOfferRepriceDto,
  ) {
    return {
      success: true,
      data: await this.offers.reprice(offerId, dto),
    };
  }

  @Post(':offerId/hold')
  @HttpCode(201)
  @ApiOperation({ summary: 'مصرف اتمیک Offer و ایجاد Hold سفارش' })
  @ApiParam({ name: 'offerId', description: 'شناسهٔ Offer' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'کلید یکتای تکرار امن فرمان رزرو',
    required: true,
  })
  @ApiCreatedResponse({ type: CoreOfferHoldResponseDto })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiBadRequestResponse({
    description: 'سفر، مسافران یا کلید تکرار معتبر نیست.',
  })
  @ApiNotFoundResponse({
    description: 'پرواز، کابین یا کلاس نرخ قابل فروش نیست.',
  })
  @ApiConflictResponse({
    description:
      'Offer منقضی/مصرف‌شده یا قیمت و ظرفیت در زمان قفل‌کردن تغییر کرده است.',
  })
  async hold(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: CoreOfferHoldDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.offers.hold(offerId, dto, idempotencyKey);
    return { success: true, data };
  }
}
