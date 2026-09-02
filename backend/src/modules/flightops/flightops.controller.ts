import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FlightopsService } from './flightops.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';

export const FLIGHTOPS_ROLES = [
  'SITE_ADMIN',
  'FINANCE_MANAGER',
  'COMMERCIAL_MANAGER',
  'EMPLOYEE',
] as const;

@ApiTags('flightops')
@Controller('flightops')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles(...FLIGHTOPS_ROLES)
export class FlightopsController {
  constructor(private readonly flightops: FlightopsService) {}

  @Get()
  @Roles('SITE_ADMIN', 'FINANCE_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('op_view')
  @ApiOperation({
    summary:
      'لیست پروازها + KPI — بستن خودکار فروش و بارگذاری نیرا هنگام مطالعه اعمال می‌شود',
  })
  async list() {
    return { success: true, data: await this.flightops.list() };
  }

  @Get(':id')
  @Roles('SITE_ADMIN', 'FINANCE_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('op_view')
  @ApiOperation({
    summary: 'جزئیات پرواز — وضعیت نیرا + لیست کامل مسافران',
  })
  async detail(@Param('id') id: string) {
    return { success: true, data: await this.flightops.detail(id) };
  }

  @Post(':id/nira-submit')
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'ارسال دستی فهرست مسافران پرواز به سامانه نیرا' })
  async submitToNira(@Param('id') id: string) {
    return { success: true, data: await this.flightops.submitToNira(id) };
  }
}
