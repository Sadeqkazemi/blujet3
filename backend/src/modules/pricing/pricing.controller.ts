import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PricingService } from './pricing.service';
import {
  RegisterProposalDto,
  RejectProposalDto,
  SetLegalRateDto,
  UpdatePublishedPriceDto,
  UpsertProposalDto,
} from './dto/pricing.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../database/enums';

@ApiTags('pricing')
@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  // EMPLOYEE: PERMISSION_CATALOG's pr_propose ("ثبت نرخ پیشنهادی") — reads
  // the same commercial-style list COMMERCIAL_MANAGER gets (proposal
  // read/write only, never CEO's legal-rate/register/ai-analysis powers).
  @Get('proposals/pending-count')
  @Roles(Role.CEO)
  @ApiOperation({
    summary: 'تعداد پیشنهادهای در انتظار تأیید مدیرعامل (badge)',
  })
  async pendingCount() {
    const data = await this.pricing.pendingApprovalsCount();
    return { success: true, data };
  }

  @Get('proposals')
  @Roles(Role.CEO, Role.COMMERCIAL_MANAGER, Role.EMPLOYEE)
  @RequiresPermission('pr_propose')
  @ApiOperation({
    summary:
      'CEO: لیست در انتظار/ثبت‌شده — بازرگانی: پروازهای برنامه‌ریزی‌شده + پیشنهادشان',
  })
  async list(@CurrentUser() actor: AuthenticatedUser) {
    const data =
      actor.role === Role.CEO
        ? await this.pricing.listForCeo()
        : await this.pricing.listForCommercial();
    return { success: true, data };
  }

  @Put('flights/:flightInstanceId/proposal')
  @Roles(Role.COMMERCIAL_MANAGER, Role.EMPLOYEE)
  @RequiresPermission('pr_propose')
  @ApiOperation({
    summary: 'ارسال/ویرایش نرخ پیشنهادی — تا قبل از تأیید قابل ویرایش',
  })
  async upsertProposal(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('flightInstanceId') flightInstanceId: string,
    @Body() dto: UpsertProposalDto,
  ) {
    const data = await this.pricing.upsertProposal(
      actor,
      flightInstanceId,
      dto,
    );
    return { success: true, data };
  }

  @Patch('flights/:flightInstanceId/price')
  @Roles(Role.COMMERCIAL_MANAGER)
  @ApiOperation({
    summary: 'افزایش/کاهش قیمت فروش پرواز منتشرشده با ثبت تاریخچه و کنترل نسخه',
  })
  async updatePublishedPrice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('flightInstanceId') flightInstanceId: string,
    @Body() dto: UpdatePublishedPriceDto,
  ) {
    const data = await this.pricing.updatePublishedPrice(
      actor,
      flightInstanceId,
      dto,
    );
    return { success: true, data };
  }

  @Patch('proposals/:id/legal-rate')
  @Roles(Role.CEO)
  @ApiOperation({ summary: 'ثبت نرخ قانونی (مصوب سازمان هواپیمایی)' })
  async setLegalRate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetLegalRateDto,
  ) {
    const data = await this.pricing.setLegalRate(actor, id, dto.legalRateIrr);
    return { success: true, data };
  }

  @Patch('proposals/:id/register')
  @Roles(Role.CEO)
  @ApiOperation({
    summary: 'تأیید و ثبت قیمت — «تأیید بازرگانی» یا «ثبت با AI» (idempotent)',
  })
  async register(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RegisterProposalDto,
  ) {
    const data = await this.pricing.register(
      actor,
      id,
      dto.source,
      dto.comment,
    );
    return { success: true, data };
  }

  @Patch('proposals/:id/approve')
  @Roles(Role.CEO)
  @ApiOperation({
    summary:
      'نام معیار canonical برای تأیید مدیرعامل (معادل PATCH .../register؛ بدون step-up/OTP)',
  })
  async approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RegisterProposalDto,
  ) {
    const data = await this.pricing.register(
      actor,
      id,
      dto.source,
      dto.comment,
    );
    return { success: true, data };
  }

  @Patch('proposals/:id/reject')
  @Roles(Role.CEO)
  @ApiOperation({
    summary: 'رد پیشنهاد قیمت با دلیل اجباری — نسخه فعال پرواز تغییر نمی‌کند',
  })
  async reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProposalDto,
  ) {
    const data = await this.pricing.reject(actor, id, dto);
    return { success: true, data };
  }

  @Post('_test/flight-instance')
  @Roles('CEO', 'COMMERCIAL_MANAGER')
  @ApiOperation({
    summary: 'E2E only — fresh SCHEDULED instance; 404 in production',
  })
  async createTestInstance() {
    const data = await this.pricing.createTestInstance();
    return { success: true, data };
  }

  @Post('proposals/ai-analysis')
  @Roles('CEO')
  @ApiOperation({
    summary: 'تحلیل و پیشنهاد قیمت هوش مصنوعی — مشورتی، با degradation امن',
  })
  async runAiAnalysis(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const requestId = (req.headers['x-request-id'] as string) ?? undefined;
    const data = await this.pricing.runAiAnalysis(actor, requestId);
    return { success: true, data };
  }
}
