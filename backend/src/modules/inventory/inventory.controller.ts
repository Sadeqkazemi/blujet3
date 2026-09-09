import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InventoryAvailabilityParamsDto } from './dto/inventory-availability.dto';
import { InventoryInternalAuthGuard } from './inventory-internal-auth.guard';
import { InventoryReadService } from './inventory-read.service';

@ApiTags('internal-inventory')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'توکن احراز هویت سرویس داخلی',
  required: true,
})
@Controller('internal/v1/inventory')
@UseGuards(InventoryInternalAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryReadService) {}

  @Get('flights/:flightInstanceId/availability')
  @ApiOperation({ summary: 'مشاهدهٔ خواندنی ظرفیت پرواز' })
  @ApiOkResponse({ description: 'projection محدود موجودی بدون PII' })
  @ApiUnauthorizedResponse({ description: 'توکن سرویس داخلی نامعتبر است.' })
  @ApiNotFoundResponse({ description: 'پرواز یافت نشد.' })
  async availability(@Param() params: InventoryAvailabilityParamsDto) {
    return {
      success: true,
      data: await this.inventory.getAvailability(params.flightInstanceId),
    };
  }
}
