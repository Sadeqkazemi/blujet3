import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerReferralsService } from './customer-referrals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Customer invite-friends program — see docs/API.md. */
@ApiTags('profile')
@Controller('my/referral')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class MyReferralController {
  constructor(private readonly referrals: CustomerReferralsService) {}

  @Get()
  @ApiOperation({ summary: 'کد معرف، آمار و فهرست دوستان دعوت‌شده' })
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.referrals.getDashboard(user);
    return { success: true, data };
  }
}
