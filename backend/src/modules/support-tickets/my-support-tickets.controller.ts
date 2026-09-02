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
import { Throttle } from '@nestjs/throttler';
import { SupportTicketsService } from './support-tickets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ReplySupportTicketDto,
  SubmitSupportTicketDto,
  SupportTicketFeedbackDto,
} from './dto/support-ticket.dtos';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Customer and agency accounts: list/detail/submit own support tickets (see
 * docs/API.md's «پنل کاربر — پیام به پشتیبانی» section). Kept separate
 * from SupportTicketsController so USER accounts never touch the
 * SITE_ADMIN review endpoints. */
@ApiTags('support-tickets')
@Controller('my/support-tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER', 'AGENCY')
export class MySupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست تیکت‌های پشتیبانی کاربر یا آژانس جاری' })
  async listMine(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.tickets.listMine(actor);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک تیکت پشتیبانی متعلق به کاربر یا آژانس' })
  async getMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.tickets.getMine(actor, id);
    return { success: true, data };
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'ثبت تیکت پشتیبانی از پنل کاربر یا آژانس (با ورود)',
  })
  async submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SubmitSupportTicketDto,
  ) {
    const data = await this.tickets.submitForUser(actor, dto);
    return { success: true, data };
  }

  @Post(':id/replies')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'ارسال پاسخ در تیکت متعلق به حساب جاری' })
  async reply(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplySupportTicketDto,
  ) {
    const data = await this.tickets.replyMine(actor, id, dto);
    return { success: true, data };
  }

  @Patch(':id/feedback')
  @ApiOperation({
    summary: 'ثبت رضایت یا نارضایتی از پاسخ پشتیبانی توسط صاحب تیکت',
  })
  async feedback(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SupportTicketFeedbackDto,
  ) {
    const data = await this.tickets.feedbackMine(actor, id, dto.satisfied);
    return { success: true, data };
  }
}
