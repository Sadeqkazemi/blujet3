import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

export class ResolveReconciliationDto {
  @ApiProperty({ example: 'بلیط دستی صادر و مغایرت رفع شد.' })
  @IsString()
  @MinLength(3)
  resolutionNote: string;
}

@ApiTags('reconciliation')
@Controller('reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('FINANCE_MANAGER')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  @ApiOperation({
    summary: 'صف مغایرت‌های پرداخت — پرداخت موفق، بلیط صادرنشده',
  })
  async list() {
    return { success: true, data: await this.reconciliation.list() };
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'رفع مغایرت پرداخت' })
  async resolve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveReconciliationDto,
  ) {
    return {
      success: true,
      data: await this.reconciliation.resolve(actor, id, dto.resolutionNote),
    };
  }
}
