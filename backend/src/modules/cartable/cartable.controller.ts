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
import { CartableService } from './cartable.service';
import { ListCartableQueryDto } from './dto/list-cartable-query.dto';
import { ResolveCartableDto } from './dto/resolve-cartable.dto';
import { TransferCartableDto } from './dto/transfer-cartable.dto';
import { SendEmployeeManagerMessageDto } from './dto/send-employee-manager-message.dto';
import { SendDirectStaffMessageDto } from './dto/send-direct-staff-message.dto';
import { ReplyCartableMessageDto } from './dto/reply-cartable-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { EXEC_ROLES, STAFF_ROLES } from '../../common/exec-roles';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('cartable')
@Controller('cartable')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
// Every internal staff role uses the same self-scoped cartable. EMPLOYEE is
// still method-scoped with @RequiresPermission(ct_*) so the IT permission
// catalog remains the server-side source of truth for employee access.
@Roles(...STAFF_ROLES)
export class CartableController {
  constructor(private readonly cartable: CartableService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  @RequiresPermission('ct_list')
  @ApiOperation({
    summary: 'کارتابل من — فقط موارد خود کاربر + شمارنده کارت‌ها',
  })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListCartableQueryDto,
  ) {
    const data = await this.cartable.list(actor, query);
    return { success: true, data };
  }

  @Get('unread-count')
  @Roles(...STAFF_ROLES)
  @RequiresPermission('ct_list')
  @ApiOperation({ summary: 'شمارندهٔ موارد دیده‌نشدهٔ کارتابل من' })
  async unreadCount(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.cartable.unreadCount(actor);
    return { success: true, data };
  }

  @Get('manager-recipients')
  @Roles('EMPLOYEE')
  @RequiresPermission('ct_process')
  @ApiOperation({ summary: 'فهرست کارکنان برای ارسال پیام داخلی — کارمند' })
  async managerRecipients(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.cartable.listManagerRecipients(actor);
    return { success: true, data };
  }

  @Post('manager-message')
  @Roles('EMPLOYEE')
  @RequiresPermission('ct_process')
  @ApiOperation({
    summary: 'ارسال پیام مستقیم داخلی — مسیر سازگار قدیمی کارمند',
  })
  async sendManagerMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SendEmployeeManagerMessageDto,
  ) {
    const data = await this.cartable.sendEmployeeManagerMessage(actor, dto);
    return { success: true, data };
  }

  @Get('manager-message/sent')
  @Roles('EMPLOYEE')
  @RequiresPermission('ct_process')
  @ApiOperation({ summary: 'پیام‌های ارسالی کارمند به مدیران' })
  async sentManagerMessages(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.cartable.listSentEmployeeManagerMessages(actor);
    return { success: true, data };
  }

  @Post('direct-message')
  @Roles(...STAFF_ROLES)
  @RequiresPermission('ct_process')
  @ApiOperation({
    summary: 'ارسال پیام مستقیم دوطرفه به یک مدیر یا کارمند',
  })
  async sendDirectMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SendDirectStaffMessageDto,
  ) {
    const data = await this.cartable.sendDirectStaffMessage(actor, dto);
    return { success: true, data };
  }

  @Post('chair-permission')
  @Roles('FINANCE_MANAGER', 'COMMERCIAL_MANAGER')
  @ApiOperation({
    summary: 'درخواست مجوز از رئیس هیئت مدیره — بنر مالی/بازرگانی',
  })
  async requestChairPermission(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.cartable.requestChairPermission(actor);
    return { success: true, data };
  }

  @Get('chair-permission')
  @Roles('FINANCE_MANAGER', 'COMMERCIAL_MANAGER')
  @ApiOperation({ summary: 'وضعیت آخرین درخواست مجوز کاربر' })
  async getChairPermission(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.cartable.getChairPermission(actor);
    return { success: true, data };
  }

  // :id must be declared after every literal-segment GET above — Nest
  // matches routes in declaration order, and a wildcard segment here would
  // otherwise swallow 'unread-count', 'manager-recipients', etc.
  @Get(':id')
  @Roles(...STAFF_ROLES)
  @RequiresPermission('ct_list')
  @ApiOperation({
    summary:
      'جزئیات یک مورد کارتابل + تاریخچه — اولین مشاهده آن را «خوانده‌شده» می‌کند',
  })
  async getById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.cartable.getById(actor, id);
    return { success: true, data };
  }

  @Patch(':id/approve')
  @Roles(...STAFF_ROLES)
  @RequiresPermission('ct_process')
  @ApiOperation({ summary: 'تأیید — نظر مدیر الزامی' })
  async approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveCartableDto,
  ) {
    const data = await this.cartable.approve(actor, id, dto.note);
    return { success: true, data };
  }

  @Post(':id/replies')
  @Roles(...STAFF_ROLES)
  @RequiresPermission('ct_process')
  @ApiOperation({
    summary: 'پاسخ به پیام داخلی؛ بستن مورد فعلی و تحویل پاسخ به فرستنده',
  })
  async reply(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplyCartableMessageDto,
  ) {
    const data = await this.cartable.replyToInternalMessage(actor, id, dto);
    return { success: true, data };
  }

  @Patch(':id/close')
  @Roles(...STAFF_ROLES)
  @RequiresPermission('ct_process')
  @ApiOperation({
    summary: 'بستن صریح کل گفتگوی داخلی و نگهداری تاریخچه در بایگانی',
  })
  async closeConversation(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.cartable.closeInternalConversation(actor, id);
    return { success: true, data };
  }

  @Patch(':id/reject')
  @Roles(...EXEC_ROLES, 'IT_MANAGER', 'OPERATIONS_MANAGER', 'SITE_ADMIN')
  @ApiOperation({ summary: 'رد (دکمه «انصراف» طراحی) — نظر مدیر الزامی' })
  async reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveCartableDto,
  ) {
    const data = await this.cartable.reject(actor, id, dto.note);
    return { success: true, data };
  }

  @Patch(':id/transfer')
  @Roles(...EXEC_ROLES, 'IT_MANAGER', 'OPERATIONS_MANAGER', 'SITE_ADMIN')
  @ApiOperation({
    summary: 'انتقال به مدیر دیگر — مورد جدید برای مقصد ساخته می‌شود',
  })
  async transfer(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransferCartableDto,
  ) {
    const data = await this.cartable.transfer(actor, id, dto.toId, dto.note);
    return { success: true, data };
  }
}
