import {
  Body,
  Controller,
  Delete,
  Param,
  ParseEnumPipe,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { ConnectFinancialIntegrationDto } from './dto/financial-integration.dto';
import {
  FINANCIAL_PROVIDERS,
  FinancialIntegrationsService,
  FinancialProvider,
} from './financial-integrations.service';

@ApiTags('financial-integrations')
@ApiBearerAuth()
@Controller('financial-integrations')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('FINANCE_MANAGER')
export class FinancialIntegrationsController {
  constructor(private readonly integrations: FinancialIntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست و وضعیت واقعی اتصال نرم‌افزارهای مالی' })
  async list() {
    return { success: true, data: await this.integrations.list() };
  }

  @Post(':provider/connect')
  @ApiParam({ name: 'provider', enum: FINANCIAL_PROVIDERS })
  @ApiOperation({ summary: 'اعتبارسنجی و ذخیره رمز‌شده کلید ارائه‌دهنده مالی' })
  @ApiUnprocessableEntityResponse({
    description: 'تنظیمات سرور ارائه‌دهنده کامل نیست.',
  })
  @ApiBadGatewayResponse({
    description: 'ارائه‌دهنده کلید را نپذیرفت یا در دسترس نبود.',
  })
  async connect(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('provider', new ParseEnumPipe(FinancialProvider))
    provider: FinancialProvider,
    @Body() dto: ConnectFinancialIntegrationDto,
  ) {
    return {
      success: true,
      data: await this.integrations.connect(actor, provider, dto.apiKey),
    };
  }

  @Post(':provider/sync')
  @ApiParam({ name: 'provider', enum: FINANCIAL_PROVIDERS })
  @ApiOperation({ summary: 'همگام‌سازی واقعی خلاصه مالی با ارائه‌دهنده متصل' })
  @ApiConflictResponse({ description: 'ارائه‌دهنده متصل نیست.' })
  @ApiBadGatewayResponse({ description: 'همگام‌سازی بالادست ناموفق بود.' })
  async sync(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('provider', new ParseEnumPipe(FinancialProvider))
    provider: FinancialProvider,
  ) {
    return {
      success: true,
      data: await this.integrations.sync(actor, provider),
    };
  }

  @Delete(':provider')
  @ApiParam({ name: 'provider', enum: FINANCIAL_PROVIDERS })
  @ApiOperation({ summary: 'حذف امن اعتبارنامه و قطع اتصال نرم‌افزار مالی' })
  async disconnect(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('provider', new ParseEnumPipe(FinancialProvider))
    provider: FinancialProvider,
  ) {
    return {
      success: true,
      data: await this.integrations.disconnect(actor, provider),
    };
  }
}
