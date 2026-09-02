import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';
import { RefundsService } from './refunds.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

class ReferRefundDto {
  @ApiProperty({ description: 'شناسه کارمند مالی مقصد ارجاع' })
  @IsUUID()
  assigneeId: string;
}

class PayRefundDto {
  @ApiProperty({
    description: 'از POST /auth/step-up/request (scope: REFUND_PAYOUT)',
  })
  @IsString()
  stepUpChallengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  stepUpCode: string;
}

@ApiTags('refunds')
@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles('FINANCE_MANAGER')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  // SITE_ADMIN: "بررسی درخواست‌های استرداد و ارجاع به مدیر مالی یا کارمند
  // مالی" — review + refer, never pay (پرداخت stays FINANCE_MANAGER-only,
  // no method-level grant below). EMPLOYEE: PERMISSION_CATALOG's
  // rf_list/rf_details/rf_process, same "never pay" boundary.
  @Get()
  @Roles('FINANCE_MANAGER', 'SITE_ADMIN', 'EMPLOYEE')
  @RequiresPermission('rf_list')
  @ApiOperation({ summary: 'فهرست درخواست‌های استرداد + سه کارت KPI' })
  async list() {
    const data = await this.refunds.list();
    return { success: true, data };
  }

  @Post('_test/request')
  @ApiOperation({
    summary: 'E2E only — درخواست FINANCE تازه؛ در production 404',
  })
  async createTestRequest() {
    const data = await this.refunds.createTestRequest();
    return { success: true, data };
  }

  @Get(':id')
  @Roles('FINANCE_MANAGER', 'SITE_ADMIN', 'EMPLOYEE')
  @RequiresPermission('rf_details')
  @ApiOperation({
    summary: 'جزئیات درخواست — تنها سطحی که شبا/PII رمزگشایی‌شده می‌گیرد',
  })
  async detail(@Param('id') id: string) {
    const data = await this.refunds.detail(id);
    return { success: true, data };
  }

  @Patch(':id/refer')
  @Roles('FINANCE_MANAGER', 'SITE_ADMIN', 'EMPLOYEE')
  @RequiresPermission('rf_process')
  @ApiOperation({
    summary: 'ثبت و انتقال فرآیند ارجاع — بدون تغییر وضعیت (طبق طراحی)',
  })
  async refer(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReferRefundDto,
  ) {
    const data = await this.refunds.refer(actor, id, dto.assigneeId);
    return { success: true, data };
  }

  @Patch(':id/pay')
  @ApiOperation({
    summary: 'تأیید، واریز به شبا و بستن پرونده — برگشت تراکنشی در دفتر کل',
  })
  async pay(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PayRefundDto,
  ) {
    const data = await this.refunds.pay(
      actor,
      id,
      dto.stepUpChallengeId,
      dto.stepUpCode,
    );
    return { success: true, data };
  }
}
