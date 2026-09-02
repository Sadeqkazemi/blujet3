import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClubService } from './club.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Customer account: club membership + card-request self-service (see
 * docs/API.md's «پنل کاربر — باشگاه مشتریان» section). */
@ApiTags('club')
@Controller('my/club')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class MyClubController {
  constructor(private readonly club: ClubService) {}

  @Get('membership')
  @ApiOperation({ summary: 'اطلاعات عضویت باشگاه مشتریان مشتری جاری' })
  async getMembership(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.club.getMyMembership(actor.id);
    return { success: true, data };
  }

  @Post('join')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'عضویت رایگان مشتری در باشگاه (سطح نقره‌ای)' })
  async join(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.club.joinMine(actor.id);
    return { success: true, data };
  }

  @Post('card-request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'ثبت درخواست صدور کارت عضویت باشگاه' })
  async submitCardRequest(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.club.submitCardRequest(actor.id);
    return { success: true, data };
  }
}
