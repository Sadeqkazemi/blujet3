import { Body, Controller, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  AdminCreateSupportCommandDto,
  FeedbackSupportCommandDto,
  ForwardSupportCommandDto,
  ReplySupportCommandDto,
  SubmitSupportForUserCommandDto,
  SubmitSupportTicketDto,
  SupportActorCommandDto,
  SupportFiltersDto,
  UpdateSupportStatusCommandDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@ApiTags('internal-support')
@ApiSecurity('internal-token')
@Controller('internal/v1/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('public/tickets')
  @ApiOperation({ summary: 'ثبت تیکت عمومی' })
  submit(@Body() input: SubmitSupportTicketDto) {
    return this.success(this.support.submit(input));
  }

  @Post('mine/tickets')
  @ApiOperation({ summary: 'ثبت تیکت برای کاربر واردشده' })
  submitMine(@Body() command: SubmitSupportForUserCommandDto) {
    return this.success(
      this.support.submitForUser(command.actor, command.input),
    );
  }

  @Post('mine/tickets/search')
  @ApiOperation({ summary: 'فهرست تیکت‌های کاربر واردشده' })
  listMine(@Body() command: SupportActorCommandDto) {
    return this.success(
      this.support.listMine(command.actor, command.callerPhone),
    );
  }

  @Post('mine/tickets/:id/detail')
  @ApiOperation({ summary: 'جزئیات تیکت متعلق به کاربر' })
  getMine(@Param('id') id: string, @Body() command: SupportActorCommandDto) {
    return this.success(
      this.support.getMine(command.actor, id, command.callerPhone),
    );
  }

  @Post('mine/tickets/:id/replies')
  @ApiOperation({ summary: 'ثبت پاسخ کاربر در تیکت' })
  replyMine(@Param('id') id: string, @Body() command: ReplySupportCommandDto) {
    return this.success(
      this.support.replyMine(
        command.actor,
        id,
        command.input,
        command.callerPhone,
      ),
    );
  }

  @Patch('mine/tickets/:id/feedback')
  @ApiOperation({ summary: 'ثبت رضایت یا نارضایت از پاسخ تیکت' })
  feedback(
    @Param('id') id: string,
    @Body() command: FeedbackSupportCommandDto,
  ) {
    return this.success(
      this.support.feedback(
        command.actor,
        id,
        command.satisfied,
        command.callerPhone,
      ),
    );
  }

  @Post('admin/tickets')
  @ApiOperation({ summary: 'ایجاد تیکت توسط کارشناس' })
  createAdmin(@Body() command: AdminCreateSupportCommandDto) {
    return this.success(this.support.createAdmin(command.actor, command.input));
  }

  @Post('admin/tickets/search')
  @ApiOperation({ summary: 'فهرست مدیریتی تیکت‌ها' })
  list(
    @Body() command: SupportActorCommandDto,
    @Query() filters: SupportFiltersDto,
  ) {
    return this.success(this.support.list(command.actor, filters));
  }

  @Post('admin/tickets/:id/detail')
  @ApiOperation({ summary: 'جزئیات مدیریتی تیکت' })
  detail(@Param('id') id: string, @Body() command: SupportActorCommandDto) {
    return this.success(this.support.detail(command.actor, id));
  }

  @Post('admin/tickets/:id/replies')
  @ApiOperation({ summary: 'ثبت پاسخ کارشناس در تیکت' })
  replyStaff(@Param('id') id: string, @Body() command: ReplySupportCommandDto) {
    return this.success(
      this.support.replyStaff(command.actor, id, command.input),
    );
  }

  @Patch('admin/tickets/:id/forward')
  @ApiOperation({ summary: 'ارجاع تیکت با snapshot نام گیرنده' })
  forward(@Param('id') id: string, @Body() command: ForwardSupportCommandDto) {
    return this.success(
      this.support.forward(command.actor, id, command.target),
    );
  }

  @Patch('admin/tickets/:id/status')
  @ApiOperation({ summary: 'به‌روزرسانی وضعیت تیکت' })
  updateStatus(
    @Param('id') id: string,
    @Body() command: UpdateSupportStatusCommandDto,
  ) {
    return this.success(
      this.support.updateStatus(command.actor, id, command.status),
    );
  }

  private async success<T>(data: Promise<T>) {
    return { success: true, data: await data };
  }
}
