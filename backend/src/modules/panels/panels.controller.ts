import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PanelsService } from './panels.service';
import { UpdatePanelAccessDto } from './dto/update-panel-access.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PanelAccessGuard } from './panel-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('panels')
@Controller('panels')
@UseGuards(JwtAuthGuard)
export class PanelsController {
  constructor(private readonly panels: PanelsService) {}

  @Get('nav')
  @UseGuards(PanelAccessGuard)
  @ApiOperation({
    summary:
      "Caller's role-scoped sidebar — server-computed, never client-decided",
  })
  async getNav(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.panels.getNav(user) };
  }

  @Get('employee-context')
  @UseGuards(RolesGuard)
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'اطلاعات داشبورد کارمند — واحد و دسترسی‌ها' })
  async getEmployeeContext(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.panels.getEmployeeContext(user) };
  }

  // Phase 12: IT_MANAGER reads the flags for its informational دسترسی به
  // پنل‌ها tab («تعیین سطح دسترسی ورود در اختیار مدیر عامل است») — PATCH
  // below stays CEO/SENIOR_MANAGER only.
  @Get('access')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'SENIOR_MANAGER', 'IT_MANAGER')
  @ApiOperation({ summary: 'Sibling panels this role may enable/disable' })
  async getAccess(@CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.panels.getAccessFlags(user) };
  }

  @Patch('access/:panelKey')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'SENIOR_MANAGER')
  @ApiOperation({ summary: 'Toggle a sibling panel on/off' })
  async setAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('panelKey') panelKey: string,
    @Body() dto: UpdatePanelAccessDto,
  ) {
    return {
      success: true,
      data: await this.panels.setAccessFlag(user, panelKey, dto.enabled),
    };
  }
}
