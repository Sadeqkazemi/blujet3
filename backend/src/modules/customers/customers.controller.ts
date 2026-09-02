import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('SITE_ADMIN', 'SENIOR_MANAGER')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({
    summary:
      'فهرست مشتریان ثبت‌نام‌شده (نقش USER) — جستجو با موبایل + شمارش پروفایل ناقص',
  })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListCustomersQueryDto,
  ) {
    const data = await this.customers.list(
      query,
      actor.role === 'SENIOR_MANAGER',
    );
    return { success: true, data };
  }

  @Get('incomplete-count')
  @ApiOperation({
    summary: 'تعداد مشتریان با پروفایل ناقص (بج ناوبری پنل ادمین سایت)',
  })
  async incompleteCount() {
    const count = await this.customers.incompleteCount();
    return { success: true, data: { count } };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'جزئیات مشتری — اطلاعات/مدارک، تاریخچه خرید، تیکت‌ها، باشگاه مشتریان',
  })
  async getById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.customers.getById(
      id,
      actor.role === 'SENIOR_MANAGER',
    );
    return { success: true, data };
  }
}
