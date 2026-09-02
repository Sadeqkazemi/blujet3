import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ItDashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';

@ApiTags('it-manager')
@Controller('it/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('IT_MANAGER')
export class ItDashboardController {
  constructor(private readonly dashboard: ItDashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'داشبورد فنی — KPI، سلامت سرویس‌ها، منابع، رویدادها',
  })
  async get() {
    return { success: true, data: await this.dashboard.get() };
  }
}
