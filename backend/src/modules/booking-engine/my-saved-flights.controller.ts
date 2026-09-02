import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SavedFlightsService } from './saved-flights.service';
import { SaveFlightDto } from './dto/save-flight.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Customer account: saved flights (نشان‌شده‌ها) — see docs/API.md. */
@ApiTags('purchase-extras')
@Controller('my/saved-flights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class MySavedFlightsController {
  constructor(private readonly savedFlights: SavedFlightsService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست پروازهای ذخیره‌شده مشتری' })
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.savedFlights.listMine(user);
    return { success: true, data };
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'ذخیره پرواز برای رزرو بعدی' })
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveFlightDto,
  ) {
    const data = await this.savedFlights.save(user, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف پرواز از نشان‌شده‌ها' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.savedFlights.remove(user, id);
    return { success: true, data };
  }
}
