import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BookingService } from '../booking-engine/booking.service';
import { RefundsService } from '../refunds/refunds.service';
import {
  LookupBookingDto,
  SubmitAnonymousRefundDto,
} from './dto/manage-booking.dtos';

/** مدیریت رزرو — anonymous PNR + last-name self-service, no login (see
 * docs/API.md's Phase 19 for why this is separate from the authenticated
 * GET /bookings/pnr/:pnr). Public: no JwtAuthGuard. */
@ApiTags('manage-booking')
@Controller('manage-booking')
export class ManageBookingController {
  constructor(
    private readonly bookings: BookingService,
    private readonly refunds: RefundsService,
  ) {}

  @Post('lookup')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'جستجوی رزرو با کد رزرو + نام خانوادگی مسافر' })
  async lookup(@Body() dto: LookupBookingDto) {
    const data = await this.bookings.getByPnrAndLastName(dto.pnr, dto.lastName);
    return { success: true, data };
  }

  @Post('refund')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'ثبت درخواست استرداد بدون ورود به حساب' })
  async refund(@Body() dto: SubmitAnonymousRefundDto) {
    const data = await this.refunds.submitAnonymous(
      dto.pnr,
      dto.lastName,
      dto.iban,
    );
    return { success: true, data };
  }
}
