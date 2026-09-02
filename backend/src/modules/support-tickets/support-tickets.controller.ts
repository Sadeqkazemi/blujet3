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
import { Throttle } from '@nestjs/throttler';
import { SupportTicketsService } from './support-tickets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AdminCreateSupportTicketDto,
  ForwardTicketDto,
  ReplySupportTicketDto,
  SubmitSupportTicketDto,
  UpdateTicketStatusDto,
} from './dto/support-ticket.dtos';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { SupportTicketStatus } from '../../database/enums';

const SUPPORT_ASSIGNEE_ROLES = [
  'SITE_ADMIN',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'COMMERCIAL_MANAGER',
  'FINANCE_MANAGER',
  'IT_MANAGER',
  'OPERATIONS_MANAGER',
] as const;
const SUPPORT_STAFF_ROLES = [...SUPPORT_ASSIGNEE_ROLES, 'EMPLOYEE'] as const;

/** پشتیبانی — ثبت عمومی تیکت و کارتابل مدیریت/کارمند با کنترل نقش و مالکیت. */
@ApiTags('support-tickets')
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'ثبت تیکت پشتیبانی (بدون ورود به حساب)' })
  async submit(@Body() dto: SubmitSupportTicketDto) {
    const data = await this.tickets.submit(dto);
    return { success: true, data };
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SITE_ADMIN')
  @ApiOperation({
    summary: 'ثبت تیکت از پنل ادمین سایت (مودال ایجاد تیکت — با بخش و اولویت)',
  })
  async createAsAdmin(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AdminCreateSupportTicketDto,
  ) {
    const data = await this.tickets.createAsAdmin(actor, dto);
    return { success: true, data };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...SUPPORT_STAFF_ROLES)
  @ApiOperation({ summary: 'فهرست تیکت‌های پشتیبانی' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('status') status?: SupportTicketStatus,
    @Query('dept') dept?: 'SITE' | 'AGENCY',
  ) {
    const data = await this.tickets.list(actor, { status, dept });
    return { success: true, data };
  }

  @Get('forward-targets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'فهرست کارکنان برای انتخاب مقصد ارجاع تیکت' })
  async forwardTargets(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.tickets.forwardTargets(actor);
    return { success: true, data };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...SUPPORT_STAFF_ROLES)
  @ApiOperation({ summary: 'جزئیات تیکت پشتیبانی' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.tickets.detail(actor, id);
    return { success: true, data };
  }

  @Patch(':id/forward')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'ارجاع تیکت به کارمند/مدیر' })
  async forward(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ForwardTicketDto,
  ) {
    const data = await this.tickets.forward(actor, id, dto.targetUserId);
    return { success: true, data };
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'تغییر وضعیت تیکت' })
  async updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    const data = await this.tickets.updateStatus(actor, id, dto.status);
    return { success: true, data };
  }

  @Post(':id/replies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...SUPPORT_STAFF_ROLES)
  @ApiOperation({
    summary: 'ارسال پاسخ پشتیبانی در گفتگو و پاسخ‌داده‌شدن تیکت',
  })
  async reply(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplySupportTicketDto,
  ) {
    const data = await this.tickets.replyAsStaff(actor, id, dto);
    return { success: true, data };
  }
}
