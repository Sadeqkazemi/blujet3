import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ManagerMessagesService } from './manager-messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { STAFF_ROLES } from '../../common/exec-roles';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('manager-messages')
@Controller('manager-messages')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles(...STAFF_ROLES)
export class ManagerMessagesController {
  constructor(private readonly messages: ManagerMessagesService) {}

  @Post()
  @ApiOperation({
    summary: 'ایجاد پیام — تحویل به‌صورت مورد کارتابل برای گیرندگان',
  })
  async send(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.messages.send(actor, dto);
    return { success: true, data };
  }

  @Get('sent')
  @ApiOperation({ summary: 'پیام‌های ارسالی خود کاربر' })
  async sent(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.messages.sent(actor);
    return { success: true, data };
  }
}
