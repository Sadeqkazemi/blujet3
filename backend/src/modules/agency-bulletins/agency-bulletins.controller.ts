import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AgencyBulletinsService } from './agency-bulletins.service';
import { CreateAgencyBulletinDto } from './dto/agency-bulletin.dtos';

@ApiTags('agency-bulletins')
@Controller('agency-bulletins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SITE_ADMIN')
export class AgencyBulletinsController {
  constructor(private readonly bulletins: AgencyBulletinsService) {}

  @Get('recipients')
  @ApiOperation({ summary: 'فهرست آژانس‌های فعال قابل انتخاب برای اطلاعیه' })
  @ApiResponse({ status: 200, description: 'فهرست آژانس‌های فعال' })
  @ApiUnauthorizedResponse({ description: 'نیازمند ورود' })
  @ApiForbiddenResponse({ description: 'فقط ادمین سایت' })
  async recipients() {
    return { success: true, data: await this.bulletins.recipients() };
  }

  @Get('admin')
  @ApiOperation({ summary: 'تاریخچه ارسال اطلاعیه و اصلاحیه آژانس‌ها' })
  @ApiResponse({ status: 200, description: 'تاریخچه گروه‌بندی‌شده ارسال‌ها' })
  @ApiUnauthorizedResponse({ description: 'نیازمند ورود' })
  @ApiForbiddenResponse({ description: 'فقط ادمین سایت' })
  async history() {
    return { success: true, data: await this.bulletins.adminHistory() };
  }

  @Post('admin')
  @ApiOperation({ summary: 'ارسال اطلاعیه یا اصلاحیه به همه/چند/یک آژانس' })
  @ApiResponse({ status: 201, description: 'اطلاعیه برای گیرندگان ذخیره شد' })
  @ApiUnauthorizedResponse({ description: 'نیازمند ورود' })
  @ApiForbiddenResponse({ description: 'فقط ادمین سایت' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAgencyBulletinDto,
  ) {
    return { success: true, data: await this.bulletins.create(actor, dto) };
  }
}
