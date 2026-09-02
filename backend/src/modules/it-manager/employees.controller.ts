import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  SetEmployeePermissionDto,
  SetEmployeeStatusDto,
} from './dto/employees.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('it-manager')
@Controller('it')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles('IT_MANAGER')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'کاتالوگ دسترسی‌ها بر اساس واحد سازمانی' })
  async catalog() {
    return { success: true, data: await this.employees.catalog() };
  }

  // EMPLOYEE grants are checked against the operation-specific keys below
  // and remain scoped server-side to their own dept (never another
  // dept's roster, see EmployeesService.deptScopeForEmployee). Creating an
  // account, suspending one, or granting/revoking permissions stays
  // IT_MANAGER-only — deliberately not part of this narrow grant.
  @Get('employees')
  @Roles('IT_MANAGER', 'EMPLOYEE')
  @RequiresPermission('us_list')
  @ApiOperation({ summary: 'فهرست کارمندان — فیلتر واحد/جستجو' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return { success: true, data: await this.employees.list(actor, query) };
  }

  @Post('employees')
  @RequiresPermission('us_create')
  @ApiOperation({ summary: 'ایجاد کارمند جدید و اعطای دسترسی‌های اولیه' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return { success: true, data: await this.employees.create(actor, dto) };
  }

  @Get('employees/:id')
  @Roles('IT_MANAGER', 'EMPLOYEE')
  @RequiresPermission('us_list')
  @ApiOperation({ summary: 'جزئیات کارمند + دسترسی‌های اعطاشده/قابل‌افزودن' })
  async get(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return { success: true, data: await this.employees.get(actor, id) };
  }

  @Patch('employees/:id/status')
  @RequiresPermission('us_status')
  @ApiOperation({ summary: 'مسدودسازی/فعال‌سازی حساب کارمند' })
  async setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetEmployeeStatusDto,
  ) {
    return {
      success: true,
      data: await this.employees.setStatus(actor, id, dto.isActive),
    };
  }

  @Delete('employees/:id')
  @RequiresPermission('us_status')
  @ApiOperation({ summary: 'بایگانی امن حساب کارمند و لغو فوری همه دسترسی‌ها' })
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.employees.remove(actor, id) };
  }

  @Patch('employees/:id/permissions')
  @RequiresPermission('us_permissions')
  @ApiOperation({ summary: 'افزودن/حذف یک دسترسی مشخص' })
  async setPermission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetEmployeePermissionDto,
  ) {
    return {
      success: true,
      data: await this.employees.setPermission(
        actor,
        id,
        dto.permissionKey,
        dto.grant,
      ),
    };
  }

  @Post('employees/:id/reset-password')
  @Roles('IT_MANAGER', 'EMPLOYEE')
  @RequiresPermission('us_reset_password')
  @ApiOperation({
    summary: 'بازنشانی رمز عبور — رمز موقت فقط یک‌بار در پاسخ برگردانده می‌شود',
  })
  async resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.employees.resetPassword(actor, id),
    };
  }
}
