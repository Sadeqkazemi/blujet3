import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PnrService } from './pnr.service';
import {
  ChangeSeatDto,
  FinalizeLockDto,
  IssuePnrDto,
  ListPnrQueryDto,
  ListReservationFlightsQueryDto,
  SearchFlightsQueryDto,
} from './dto/reservation.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RESERVATION_ROLES, CAN_LOCK_ROLES } from './reservation-roles';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('reservation')
@Controller('reservation')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles(...RESERVATION_ROLES)
export class PnrController {
  constructor(private readonly pnr: PnrService) {}

  @Get('pnr')
  @ApiOperation({ summary: 'فهرست رزروها — گروه‌بندی‌شده بر اساس پرواز' })
  async list(@Query() query: ListPnrQueryDto) {
    return { success: true, data: await this.pnr.list(query) };
  }

  @Get('pnr/:pnr')
  @ApiOperation({ summary: 'جزئیات رزرو / بلیط' })
  async detail(@Param('pnr') pnr: string) {
    return { success: true, data: await this.pnr.detail(pnr) };
  }

  @Patch('pnr/:pnr/seat')
  @Roles(...CAN_LOCK_ROLES)
  @ApiOperation({ summary: 'تغییر صندلی رزرو' })
  async changeSeat(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('pnr') pnr: string,
    @Body() dto: ChangeSeatDto,
  ) {
    return {
      success: true,
      data: await this.pnr.changeSeat(actor, pnr, dto.seatCode),
    };
  }

  @Patch('pnr/:pnr/cancel')
  @Roles(...CAN_LOCK_ROLES)
  @ApiOperation({ summary: 'لغو رزرو' })
  async cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('pnr') pnr: string,
  ) {
    return { success: true, data: await this.pnr.cancel(actor, pnr) };
  }

  @Patch('pnr/:pnr/no-show')
  @Roles(...CAN_LOCK_ROLES)
  @ApiOperation({ summary: 'ثبت عدم حضور مسافر — فقط پس از انجام پرواز' })
  async markNoShow(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('pnr') pnr: string,
  ) {
    return { success: true, data: await this.pnr.markNoShow(actor, pnr) };
  }

  @Get('flights')
  @ApiOperation({
    summary: 'فهرست پروازهای آینده برای تب پروازها / باز کردن نقشهٔ صندلی',
  })
  async listFlights(@Query() query: ListReservationFlightsQueryDto) {
    return { success: true, data: await this.pnr.listFlights(query) };
  }

  @Get('search')
  @ApiOperation({ summary: 'جستجوی پرواز برای صدور دستی رزرو' })
  async search(@Query() query: SearchFlightsQueryDto) {
    return { success: true, data: await this.pnr.search(query) };
  }

  @Post('pnr')
  @Roles(...CAN_LOCK_ROLES)
  @ApiOperation({ summary: 'صدور دستی PNR و بلیط (بدون درگاه پرداخت)' })
  async issue(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: IssuePnrDto,
  ) {
    return { success: true, data: await this.pnr.issue(actor, dto) };
  }

  @Post('pnr/from-lock/:lockId')
  @Roles(...CAN_LOCK_ROLES)
  @ApiOperation({
    summary: 'صدور بلیط از لاک مدیریتیِ تأییدشده — قیمت بر اساس طبقه‌بندی لاک',
  })
  async finalizeLock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('lockId') lockId: string,
    @Body() dto: FinalizeLockDto,
  ) {
    return {
      success: true,
      data: await this.pnr.finalizeLock(actor, lockId, dto),
    };
  }

  @Get('dashboard-stats')
  @ApiOperation({
    summary:
      'آمار واقعی رزروها + تفکیک کانال + وضعیت سرویس‌های وابسته (بر اساس toggle/latency واقعی)',
  })
  async dashboardStats() {
    return { success: true, data: await this.pnr.dashboardStats() };
  }

  @Get('agency-api-access')
  @ApiOperation({
    summary: 'فهرست آژانس‌هایی که کلید API دارند — تب دسترسی آژانس‌ها',
  })
  async agencyApiAccess() {
    return { success: true, data: await this.pnr.agencyApiAccess() };
  }

  @Post('_test/flight-instance')
  @ApiOperation({
    summary: 'E2E only — fresh SCHEDULED instance; 404 in production',
  })
  async createTestInstance() {
    const data = await this.pnr.createTestInstance();
    return { success: true, data };
  }
}
