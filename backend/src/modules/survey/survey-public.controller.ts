import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SurveyService } from './survey.service';
import { SubmitSurveyResponseDto } from './dto/survey.dtos';

/** Public, no-login survey submission — the token itself is the
 * credential (same posture as مدیریت رزرو's PNR+last-name lookup). See
 * docs/API.md's Phase 66. Separate controller so SurveyController's
 * class-level JwtAuthGuard never applies here. */
@ApiTags('survey')
@Controller('survey')
export class SurveyPublicController {
  constructor(private readonly survey: SurveyService) {}

  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'مشاهدهٔ فرم نظرسنجی با توکن دعوت' })
  async getInvite(@Param('token') token: string) {
    return { success: true, data: await this.survey.getPublicInvite(token) };
  }

  @Post(':token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'ثبت پاسخ نظرسنجی' })
  async submit(
    @Param('token') token: string,
    @Body() dto: SubmitSurveyResponseDto,
  ) {
    return {
      success: true,
      data: await this.survey.submitResponse(token, dto),
    };
  }
}
