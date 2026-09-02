import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeatmapService } from './seatmap.service';
import { LockSeatDto, RejectLockDto } from './dto/reservation.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RESERVATION_ROLES, CAN_SEAT_LOCK_ROLES } from './reservation-roles';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('reservation')
@Controller('reservation/seatmap')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles(...RESERVATION_ROLES)
export class SeatmapController {
  constructor(private readonly seatmap: SeatmapService) {}

  @Get('agencies/active')
  @ApiOperation({ summary: 'فهرست آژانس‌های فعال برای هدف لاک صندلی' })
  async agencies() {
    return { success: true, data: await this.seatmap.listLockAgencies() };
  }

  @Get(':flightInstanceId')
  @ApiOperation({
    summary:
      'نقشهٔ صندلی — آزاد/فروخته/قفل + مشخصات مسافر روی صندلی فروخته‌شده (staff)',
  })
  async get(@Param('flightInstanceId') flightInstanceId: string) {
    return {
      success: true,
      data: await this.seatmap.getSeatMap(flightInstanceId),
    };
  }

  @Post(':flightInstanceId/lock')
  @Roles(...CAN_SEAT_LOCK_ROLES)
  @ApiOperation({
    summary: 'درخواست لاک مدیریتی صندلی — در انتظار تأیید یک نقش دیگر (نه IT)',
  })
  async lock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('flightInstanceId') flightInstanceId: string,
    @Body() dto: LockSeatDto,
  ) {
    return {
      success: true,
      data: await this.seatmap.lockSeat(actor, flightInstanceId, dto),
    };
  }

  @Patch('locks/:id/approve')
  @Roles(...CAN_SEAT_LOCK_ROLES)
  @ApiOperation({
    summary: 'تأیید درخواست لاک مدیریتی — نه توسط درخواست‌کننده',
  })
  async approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.seatmap.approveLock(actor, id) };
  }

  @Patch('locks/:id/reject')
  @Roles(...CAN_SEAT_LOCK_ROLES)
  @ApiOperation({ summary: 'رد درخواست لاک مدیریتی' })
  async reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectLockDto,
  ) {
    return {
      success: true,
      data: await this.seatmap.rejectLock(actor, id, dto),
    };
  }

  @Patch('locks/:id/release')
  @Roles(...CAN_SEAT_LOCK_ROLES)
  @ApiOperation({ summary: 'آزادسازی لاک صندلی' })
  async release(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.seatmap.releaseLock(actor, id) };
  }
}
