import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EXEC_ROLES } from '../../common/exec-roles';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'ارجاعات من به مدیران + کارت‌های KPI' })
  async list(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.referrals.list(actor);
    return { success: true, data };
  }

  @Post()
  @Roles('SENIOR_MANAGER')
  @ApiOperation({
    summary: 'ایجاد ارجاع جدید — برای هر مقصد یک مورد کارتابل ساخته می‌شود',
  })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateReferralDto,
  ) {
    const data = await this.referrals.create(actor, dto);
    return { success: true, data };
  }

  @Get('mine')
  // Declared before ':id' so Nest/Express doesn't match 'mine' as an :id
  // param — same convention as agencies.controller.ts.
  @Roles(...EXEC_ROLES, 'SITE_ADMIN', 'IT_MANAGER', 'EMPLOYEE')
  @ApiOperation({ summary: 'ارجاعات محول‌شده به من (سمت گیرنده)' })
  async mine(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.referrals.myReferrals(actor);
    return { success: true, data };
  }

  @Get(':id')
  // Recipients (any exec/staff role) may read their own referral; the
  // service enforces sender-or-recipient at resource level.
  @Roles(...EXEC_ROLES, 'SITE_ADMIN', 'IT_MANAGER', 'EMPLOYEE')
  @ApiOperation({ summary: 'جزئیات ارجاع + گزارش‌های دریافتی' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.referrals.detail(actor, id);
    return { success: true, data };
  }

  @Post(':id/reports')
  @Roles(...EXEC_ROLES, 'SITE_ADMIN', 'IT_MANAGER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'ثبت گزارش توسط مدیر مقصد — وضعیت → گزارش دریافت‌شد',
  })
  async submitReport(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateReportDto,
  ) {
    const data = await this.referrals.submitReport(actor, id, dto);
    return { success: true, data };
  }

  @Patch(':id/close')
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'تأیید دریافت گزارش و بستن' })
  async close(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.referrals.close(actor, id);
    return { success: true, data };
  }

  @Patch(':id/request-revision')
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'درخواست اصلاح گزارش' })
  async requestRevision(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.referrals.requestRevision(actor, id);
    return { success: true, data };
  }

  @Post(':id/remind')
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'ارسال یادآوری دریافت گزارش' })
  async remind(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.referrals.remind(actor, id);
    return { success: true, data };
  }
}
