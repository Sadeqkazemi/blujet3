import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OpsAdminCartableQueryDto } from './dto/ops-admin-cartable-query.dto';
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
