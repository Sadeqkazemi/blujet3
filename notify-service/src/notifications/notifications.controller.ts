import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EntityNotificationQueryDto,
  NotificationListQueryDto,
  RecipientDto,
} from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('internal-notifications')
@Controller('internal/v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست اعلان‌های یک دریافت‌کننده احراز‌شده' })
  async list(@Query() query: NotificationListQueryDto) {
    const data = await this.notifications.list(query.recipientId, query.role, {
      category: query.category,
      unreadOnly: query.unreadOnly === 'true',
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
    return { success: true, data };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'شمارنده اعلان‌های نخوانده دریافت‌کننده' })
  async unreadCount(@Query() query: RecipientDto) {
    const data = await this.notifications.unreadCount(
      query.recipientId,
      query.role,
    );
    return { success: true, data };
  }

  @Get('by-entity')
  @ApiOperation({ summary: 'گزارش داخلی اعلان‌ها بر اساس نوع موجودیت' })
  async byEntity(@Query() query: EntityNotificationQueryDto) {
    const data = await this.notifications.listByEntityType(query.entityType);
    return { success: true, data };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'خوانده‌کردن اعلان‌های قابل‌مشاهده دریافت‌کننده' })
  async markAllRead(@Body() recipient: RecipientDto) {
    const data = await this.notifications.markAllRead(
      recipient.recipientId,
      recipient.role,
    );
    return { success: true, data };
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'خوانده‌کردن idempotent یک اعلان متعلق به دریافت‌کننده',
  })
  async markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() recipient: RecipientDto,
  ) {
    const data = await this.notifications.markRead(
      recipient.recipientId,
      recipient.role,
      id,
    );
    return { success: true, data };
  }
}
