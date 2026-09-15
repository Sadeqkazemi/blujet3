import {
  Controller,
  Get,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OpsAdminCartableQueryDto } from './dto/ops-admin-cartable-query.dto';
import { OpsAdminAssigneeId } from './ops-admin-assignee-id.decorator';
import { OpsAdminInternalAuthGuard } from './ops-admin-internal-auth.guard';
import { OpsAdminReadService } from './ops-admin-read.service';

@ApiTags('internal-ops-admin')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/ops-admin/cartable')
@UseGuards(OpsAdminInternalAuthGuard)
export class OpsAdminController {
  constructor(private readonly opsAdmin: OpsAdminReadService) {}

  @Get('unread-count')
  @ApiOperation({ summary: 'شمارندهٔ فقط‌خواندنی کارتابل یک کارمند' })
  @ApiHeader({
    name: 'X-Ops-Admin-Assignee-Id',
    description: 'شناسهٔ مالک کارتابل از هویت احرازشدهٔ Core',
    required: true,
  })
  @ApiOkResponse({ description: 'شمارندهٔ owner-scoped بدون متادیتای وظیفه' })
  @ApiBadRequestResponse({ description: 'شناسهٔ مالک کارتابل معتبر نیست.' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  async unreadCount(
    @OpsAdminAssigneeId(new ParseUUIDPipe({ version: '4' }))
    assigneeId: string,
  ) {
    return {
      success: true,
      data: await this.opsAdmin.cartableUnreadCount(assigneeId),
    };
  }

  @Get('summary')
  @ApiOperation({ summary: 'خلاصهٔ فقط‌خواندنی صف کارتابل' })
  @ApiOkResponse({ description: 'شمارش صف بر اساس category و status' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  async summary() {
    return { success: true, data: await this.opsAdmin.cartableSummary() };
  }

  @Get('tasks')
  @ApiOperation({ summary: 'صف محدود متادیتای کارتابل بدون متن و PII مستقیم' })
  @ApiOkResponse({ description: 'فهرست فقط‌خواندنی متادیتای صف' })
  @ApiBadRequestResponse({ description: 'فیلتر یا حد صف معتبر نیست.' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  async tasks(@Query() query: OpsAdminCartableQueryDto) {
    return {
      success: true,
      data: await this.opsAdmin.listCartableTasks(
        query.status,
        query.category,
        query.limit,
      ),
    };
  }
}
