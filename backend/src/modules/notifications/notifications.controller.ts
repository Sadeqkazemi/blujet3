import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { NotificationListQueryDto } from './dto/notification-query.dto';

/** Available to every authenticated role (staff, agency, customer) —
 * each notification is already scoped to `recipientId = actor.id` at the
 * service layer, so no @Roles()/panel guard narrowing is needed here. */
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست اعلان‌های کاربر جاری (جدیدترین ابتدا)' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: NotificationListQueryDto,
  ) {
    const data = await this.notifications.list(actor, {
      category: query.category,
      unreadOnly: query.unreadOnly === 'true',
      limit: query.limit,
      offset: query.offset,
    });
    return { success: true, data };
  }

  @Get('unread-count')
  @ApiOperation({
    summary:
      'شمارنده اعلان‌های نخوانده — کل + تفکیک‌شده به CARTABLE/MESSAGE/REQUEST/APPROVAL/SYSTEM',
  })
  async unreadCount(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.notifications.unreadCount(actor);
    return { success: true, data };
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'علامت‌گذاری یک اعلان به‌عنوان خوانده‌شده (idempotent)',
  })
  async markRead(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const data = await this.notifications.markRead(actor, id);
    return { success: true, data };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'علامت‌گذاری همه اعلان‌های نخوانده کاربر جاری' })
  async markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.notifications.markAllRead(actor);
    return { success: true, data };
  }
}
