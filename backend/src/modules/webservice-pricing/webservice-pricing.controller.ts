import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { WebservicePricingService } from './webservice-pricing.service';
import { UpdateWebservicePricingDto } from './dto/update-webservice-pricing.dto';

@ApiTags('webservice-pricing')
@Controller('webservice/pricing')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
  PanelAccessGuard,
  EmployeePermissionGuard,
)
export class WebservicePricingController {
  constructor(private readonly pricing: WebservicePricingService) {}

  @Get()
  @Roles('COMMERCIAL_MANAGER', 'CEO', 'SENIOR_MANAGER', 'EMPLOYEE')
  @RequiresPermission('ws_view')
  @ApiOperation({ summary: 'قیمت پلن‌های وب‌سرویس B2B (ریال)' })
  async getPricing() {
    const prices = await this.pricing.getPlanPrices();
    return { success: true, data: { prices } };
  }

  @Patch()
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('ws_manage')
  @ApiOperation({
    summary: 'به‌روزرسانی قیمت پلن‌های ۱/۳/۱۲ ماهه — فقط مدیر بازرگانی',
  })
  async updatePricing(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateWebservicePricingDto,
  ) {
    const prices = await this.pricing.updatePlanPrices(actor, {
      1: dto.month1PriceIrr,
      3: dto.month3PriceIrr,
      12: dto.month12PriceIrr,
    });
    return { success: true, data: { prices } };
  }
}
