import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ProfileService } from './profile.service';
import { UpdateProfileDto, VerifyEmailDto } from './dto/profile.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Phase 17 — «پروفایل من». See docs/API.md Phase 17. */
@ApiTags('profile')
@Controller('my/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'اطلاعات پروفایل من + درصد تکمیل' })
  async get(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.profile.getProfile(actor) };
  }

  @Patch()
  @ApiOperation({ summary: 'ویرایش اطلاعات هویتی پروفایل من' })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return {
      success: true,
      data: await this.profile.updateProfile(actor, dto),
    };
  }

  @Post('email/verify-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'ارسال کد تأیید به ایمیل ثبت‌شده' })
  async requestEmailVerify(@CurrentUser() actor: AuthenticatedUser) {
    return {
      success: true,
      data: await this.profile.requestEmailVerify(actor),
    };
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تأیید کد ایمیل' })
  async verifyEmail(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: VerifyEmailDto,
  ) {
    return {
      success: true,
      data: await this.profile.verifyEmail(actor, dto.challengeId, dto.code),
    };
  }
}
