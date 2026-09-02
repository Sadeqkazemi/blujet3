import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AgenciesService } from './agencies.service';
import { RequestAgencyOtpDto } from './dto/request-agency-otp.dto';
import { CreateAgencyRequestDto } from './dto/create-agency-request.dto';

/** Phase 16 — public front door onto AgencyMembershipRequest. Deliberately
 * a SEPARATE controller (not a route on AgenciesController) since that one
 * is guarded class-wide (JwtAuthGuard/RolesGuard) and these two routes must
 * be reachable by an anonymous prospective agency. See docs/API.md Phase 16. */
@ApiTags('agencies')
@Controller('agencies/requests')
export class AgencyRequestsPublicController {
  constructor(private readonly agencies: AgenciesService) {}

  @Post('otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'پیش‌ثبت‌نام آژانس همکار — ارسال کد تأیید به شماره موبایل',
  })
  async requestOtp(@Body() dto: RequestAgencyOtpDto) {
    const data = await this.agencies.requestPublicOtp(dto.phone);
    return { success: true, data };
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'ثبت درخواست همکاری آژانس — ایجاد رکورد PENDING پس از تأیید کد',
  })
  async create(@Body() dto: CreateAgencyRequestDto) {
    const data = await this.agencies.createPublicRequest(dto);
    return { success: true, data };
  }

  @Get('_test/last-code/:challengeId')
  @ApiOperation({
    summary: 'E2E-test only: reads back the mock OTP code. 404s in production.',
  })
  testLastCode(@Param('challengeId') challengeId: string) {
    const code = this.agencies.getLastRequestOtpCode(challengeId);
    if (code === null) throw new NotFoundException();
    return { success: true, data: { code } };
  }
}
