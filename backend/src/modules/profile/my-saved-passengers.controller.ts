import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SavedPassengersService } from './saved-passengers.service';
import {
  CreateSavedPassengerDto,
  UpdateSavedPassengerDto,
} from './dto/saved-passenger.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Customer account: saved passengers (مسافران ذخیره‌شده) — see docs/API.md. */
@ApiTags('profile')
@Controller('my/saved-passengers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class MySavedPassengersController {
  constructor(private readonly savedPassengers: SavedPassengersService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست مسافران ذخیره‌شده مشتری' })
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.savedPassengers.listMine(user);
    return { success: true, data };
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'افزودن مسافر به دفترچه آدرس' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedPassengerDto,
  ) {
    const data = await this.savedPassengers.create(user, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش مسافر ذخیره‌شده' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedPassengerDto,
  ) {
    const data = await this.savedPassengers.update(user, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف مسافر از دفترچه' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.savedPassengers.remove(user, id);
    return { success: true, data };
  }
}
