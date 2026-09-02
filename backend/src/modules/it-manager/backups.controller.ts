import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BackupsService } from './backups.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('it-manager')
@Controller('it/backups')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('IT_MANAGER')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست نسخه‌های پشتیبان' })
  async list() {
    return { success: true, data: await this.backups.list() };
  }

  @Post()
  @ApiOperation({ summary: 'ایجاد نسخه پشتیبان جدید (pg_dump واقعی)' })
  async create(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.backups.create(actor) };
  }

  @Get('schedule')
  @ApiOperation({ summary: 'زمان‌بندی خودکار پشتیبان‌گیری' })
  schedule() {
    return { success: true, data: this.backups.schedule() };
  }
}
