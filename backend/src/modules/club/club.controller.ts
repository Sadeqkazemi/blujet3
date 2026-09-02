import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClubService } from './club.service';
import {
  CreateMemberDto,
  ListMembersQueryDto,
  UpdateLevelDto,
  UpdateTierRulesDto,
  ReferCardRequestDto,
} from './dto/club.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const CLUB_ROLES = ['CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER'] as const;

@ApiTags('club')
@Controller('club')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles(...CLUB_ROLES)
export class ClubController {
  constructor(private readonly club: ClubService) {}

  // SITE_ADMIN: پنل ادمین سایت.dc.html's "club" tab ("پروفایل اعضا، صدور
  // کارت و ارجاع درخواست‌ها"). createMember/updateLevel/card-requests
  // approve|reject stay untouched — those are CEO/BOARD_CHAIR/
  // SENIOR_MANAGER-only per the existing design.
  @Get('members')
  @Roles('CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER', 'SITE_ADMIN')
  @ApiOperation({ summary: 'اعضای باشگاه + کارت‌های KPI (فیلتر سطح/جستجو)' })
  async listMembers(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListMembersQueryDto,
  ) {
    const data = await this.club.listMembers(query, actor);
    return { success: true, data };
  }

  @Post('members')
  @Roles('CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER')
  @ApiOperation({
    summary: 'تعریف مشتری VIP جدید — مدیر ارشد/مدیر عامل/رئیس هیئت مدیره',
  })
  async createMember(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateMemberDto,
  ) {
    const data = await this.club.createMember(actor, dto);
    return { success: true, data };
  }

  @Patch('members/:id/deactivate')
  @Roles('CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER')
  @ApiOperation({ summary: 'غیرفعال‌سازی عضویت VIP با حفظ سوابق و ممیزی' })
  async deactivateMember(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.club.deactivateMember(actor, id);
    return { success: true, data };
  }

  @Patch('members/:id/level')
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'تغییر سطح عضویت — فقط مدیر ارشد، با ممیزی' })
  async updateLevel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLevelDto,
  ) {
    const data = await this.club.updateLevel(actor, id, dto.level);
    return { success: true, data };
  }

  @Post('members/:id/issue-card')
  @Roles('CEO', 'BOARD_CHAIR', 'SENIOR_MANAGER', 'SITE_ADMIN')
  @ApiOperation({ summary: 'صدور مستقیم کارت — بدون رکورد درخواست، با ممیزی' })
  async issueCard(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.club.issueCardDirect(actor, id);
    return { success: true, data };
  }

  @Get('card-requests')
  @ApiOperation({
    summary: 'صف درخواست‌های کارت (فقط ارجاع‌شده/تأیید/رد) + تایم‌لاین',
  })
  async listRequests() {
    const data = await this.club.listRequests();
    return { success: true, data };
  }

  @Get('submitted-card-requests')
  @Roles('SITE_ADMIN')
  @ApiOperation({
    summary:
      'صف درخواست‌های صدور کارت برای ادمین سایت (همه وضعیت‌ها؛ ارجاع فقط روی SUBMITTED)',
  })
  async listSubmittedRequests() {
    const data = await this.club.listSubmittedRequests();
    return { success: true, data };
  }

  @Patch('card-requests/:id/refer')
  @Roles('SITE_ADMIN')
  @ApiOperation({
    summary: 'ارجاع درخواست SUBMITTED به مدیر ارشد یا رئیس هیئت مدیره',
  })
  async referRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReferCardRequestDto,
  ) {
    const data = await this.club.referRequest(actor, id, dto.assignedTo);
    return { success: true, data };
  }

  @Post('_test/card-request')
  @ApiOperation({
    summary: 'E2E only — creates a fresh REFERRED request; 404 in production',
  })
  async createTestRequest(@Body() body: { assignedTo?: 'SENIOR' | 'CHAIR' }) {
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'یافت نشد.' },
      };
    }
    const data = await this.club.createTestRequest(
      body.assignedTo === 'CHAIR' ? 'CHAIR' : 'SENIOR',
    );
    return { success: true, data };
  }

  @Patch('card-requests/:id/approve')
  @ApiOperation({ summary: 'تأیید و صدور کارت — مدیر ارشد فقط ارجاع‌های خودش' })
  async approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.club.decideRequest(actor, id, 'approve');
    return { success: true, data };
  }

  @Patch('card-requests/:id/reject')
  @ApiOperation({ summary: 'رد درخواست (دکمه «انصراف» طراحی)' })
  async reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.club.decideRequest(actor, id, 'reject');
    return { success: true, data };
  }

  // پنل مدیر بازرگانی.dc.html's "clubrules" tab — COMMERCIAL_MANAGER only
  // (CEO design sidebar has no clubrules entry).
  @Get('tier-rules')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('cl_rules_view')
  @ApiOperation({ summary: 'قوانین حد نصاب امتیاز سطوح باشگاه مشتریان' })
  async getTierRules() {
    const data = await this.club.getTierRules();
    return { success: true, data };
  }

  @Patch('tier-rules')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('cl_rules_manage')
  @ApiOperation({ summary: 'تغییر قوانین حد نصاب امتیاز سطوح باشگاه مشتریان' })
  async updateTierRules(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateTierRulesDto,
  ) {
    const data = await this.club.updateTierRules(actor, dto);
    return { success: true, data };
  }
}
