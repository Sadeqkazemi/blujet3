import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ErrorCode } from '../../common/errors';
import { AgencyApiScope } from '../../database/enums';
import { AgencyPortalService } from '../agency-portal/agency-portal.service';
import { BookingService } from '../booking-engine/booking.service';
import { SearchService } from '../booking-engine/search.service';
import { CurrentPartner, PartnerScopes } from './partner-api.decorators';
import {
  PartnerBookDto,
  PartnerBookingReferenceDto,
  PartnerFlightSearchDto,
} from './dto/partner-api.dto';
import {
  PartnerApiKeyGuard,
  type PartnerApiContext,
} from './partner-api-key.guard';

const SEARCH_SCOPES = [
  AgencyApiScope.SEARCH_ONLY,
  AgencyApiScope.SEARCH_BOOK,
  AgencyApiScope.FULL,
];
const BOOK_SCOPES = [AgencyApiScope.SEARCH_BOOK, AgencyApiScope.FULL];

@ApiTags('agency-b2b')
@ApiSecurity('agency-api-key')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(PartnerApiKeyGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('api/v2')
export class PartnerApiController {
  constructor(
    private readonly search: SearchService,
    private readonly bookings: BookingService,
    private readonly portal: AgencyPortalService,
  ) {}

  @Post('accounting/getAuthorizeToken')
  @PartnerScopes(...SEARCH_SCOPES)
  @ApiOperation({ summary: 'اعتبارسنجی کلید API آژانس (بدون صدور توکن دوم)' })
  authorize(@CurrentPartner() partner: PartnerApiContext) {
    return {
      success: true,
      data: {
        authenticated: true,
        agencyId: partner.actor.id,
        scope: partner.scope,
        authentication: 'X-API-Key',
      },
    };
  }

  @Post('flight/FlightSearch')
  @PartnerScopes(...SEARCH_SCOPES)
  @ApiOperation({ summary: 'جستجوی موجودی منتشرشده و مستقیم blujet' })
  async flightSearch(@Body() dto: PartnerFlightSearchDto) {
    const data = await this.search.search(
      dto.origin,
      dto.destination,
      dto.date,
    );
    return { success: true, data };
  }

  @Get('flight/Allotments')
  @PartnerScopes(...BOOK_SCOPES)
  @ApiOperation({ summary: 'سهمیه‌های واقعی و قابل فروش متعلق به آژانس' })
  async allotments(@CurrentPartner() partner: PartnerApiContext) {
    return {
      success: true,
      data: await this.portal.allotments(partner.actor),
    };
  }

  @Get('flight/:flightInstanceId/SeatMap')
  @PartnerScopes(...SEARCH_SCOPES)
  @ApiOperation({ summary: 'نقشه صندلی موجودی داخلی پرواز' })
  async seatMap(@Param('flightInstanceId') flightInstanceId: string) {
    return { success: true, data: await this.search.seatMap(flightInstanceId) };
  }

  @Post('flight/Book')
  @PartnerScopes(...BOOK_SCOPES)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'کلید یکتای هر تلاش رزرو؛ در تکرار همان پاسخ بازمی‌گردد',
  })
  @ApiOperation({ summary: 'رزرو تراکنشی از سهمیه اختصاصی آژانس' })
  async book(
    @CurrentPartner() partner: PartnerApiContext,
    @Body() dto: PartnerBookDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هدر Idempotency-Key برای رزرو الزامی است.',
      });
    }
    const data = await this.bookings.createAgencyAllotmentBooking(
      partner.actor,
      dto.allotmentId,
      { cabin: dto.cabin, passengers: dto.passengers },
      idempotencyKey.trim(),
    );
    return { success: true, data };
  }

  @Get('flight/Bookings/:bookingReference')
  @PartnerScopes(...BOOK_SCOPES)
  @ApiOperation({ summary: 'بازیابی رزرو متعلق به آژانس با شناسه یا PNR' })
  async booking(
    @CurrentPartner() partner: PartnerApiContext,
    @Param('bookingReference') bookingReference: string,
  ) {
    return {
      success: true,
      data: await this.bookings.getAgencyBooking(
        bookingReference,
        partner.actor,
      ),
    };
  }

  @Post('flight/AirDemandTicket')
  @PartnerScopes(...BOOK_SCOPES)
  @ApiOperation({
    summary:
      'دریافت نتیجه صدور رزرو آژانسی (رزرو سهمیه‌ای همان لحظه TICKETED است)',
  })
  async ticket(
    @CurrentPartner() partner: PartnerApiContext,
    @Body() dto: PartnerBookingReferenceDto,
  ) {
    return {
      success: true,
      data: await this.bookings.getAgencyBooking(
        dto.bookingReference,
        partner.actor,
      ),
    };
  }

  @Get('accounting/myCredit')
  @PartnerScopes(...BOOK_SCOPES)
  @ApiOperation({ summary: 'سقف، مصرف و مانده اعتبار آژانس' })
  async credit(@CurrentPartner() partner: PartnerApiContext) {
    return { success: true, data: await this.portal.credit(partner.actor) };
  }

  @Post('accounting/myCredit')
  @PartnerScopes(...BOOK_SCOPES)
  @ApiOperation({ summary: 'سازگاری نسخه قدیمی: مانده اعتبار آژانس' })
  async legacyCredit(@CurrentPartner() partner: PartnerApiContext) {
    return { success: true, data: await this.portal.credit(partner.actor) };
  }
}
