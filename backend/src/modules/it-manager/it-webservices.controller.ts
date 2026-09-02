import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { CreateApiKeyDto } from '../agencies/dto/create-api-key.dto';
import { DecideWebserviceRequestDto } from '../agencies/dto/decide-webservice-request.dto';
import { UpdateApiKeyDto } from '../agencies/dto/update-api-key.dto';
import { CreateItApiClientDto } from './dto/create-it-api-client.dto';
import { TestAvailabilityDto } from './dto/test-availability.dto';
import { ItWebservicesService } from './it-webservices.service';

@ApiTags('it-manager-webservices')
@Controller('it/webservices')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('IT_MANAGER')
@ApiForbiddenResponse({ description: 'فقط مدیر فناوری اطلاعات مجاز است.' })
export class ItWebservicesController {
  constructor(private readonly webservices: ItWebservicesService) {}

  @Get()
  @ApiOperation({ summary: 'نمای کلی درخواست‌ها و کلاینت‌های API آژانس‌ها' })
  @ApiResponse({ status: 200, description: 'دادهٔ واقعی صفحهٔ وب‌سرویس‌ها' })
  async overview() {
    return { success: true, data: await this.webservices.overview() };
  }

  @Patch('requests/:id/decide')
  @ApiOperation({ summary: 'تأیید یا رد درخواست وب‌سرویس آژانس' })
  @ApiResponse({ status: 200, description: 'تصمیم ثبت شد.' })
  @ApiNotFoundResponse({ description: 'درخواست یافت نشد.' })
  async decideRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideWebserviceRequestDto,
  ) {
    return {
      success: true,
      data: await this.webservices.decideRequest(actor, id, dto),
    };
  }

  @Post('clients')
  @ApiOperation({ summary: 'صدور کلید API برای آژانس ثبت‌شده' })
  @ApiResponse({
    status: 201,
    description: 'کلید صادر و فقط یک بار بازگردانده شد.',
  })
  async issueClient(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateItApiClientDto,
  ) {
    const keyDto: CreateApiKeyDto = dto;
    return {
      success: true,
      data: await this.webservices.issueClient(
        actor,
        dto.agencyId,
        keyDto.scope,
        keyDto.stepUpChallengeId,
        keyDto.stepUpCode,
        {
          environment: keyDto.environment,
          flightDomain: keyDto.flightDomain,
          capabilities: keyDto.capabilities,
          ipWhitelist: keyDto.ipWhitelist,
          rateLimitPerMinute: keyDto.rateLimitPerMinute,
          expiresAt: keyDto.expiresAt,
        },
      ),
    };
  }

  @Patch('clients/:id')
  @ApiOperation({
    summary: 'تعلیق، فعال‌سازی، لغو، چرخش یا به‌روزرسانی سیاست کلید API',
  })
  @ApiResponse({ status: 200, description: 'کلاینت API به‌روزرسانی شد.' })
  @ApiNotFoundResponse({ description: 'کلاینت یافت نشد.' })
  async updateClient(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ) {
    return {
      success: true,
      data: await this.webservices.updateClient(actor, id, dto),
    };
  }

  @Post('clients/:id/test-availability')
  @ApiOperation({
    summary: 'آزمایشگر استعلام ظرفیت — همان منطق دسترسی AVAILABILITY',
  })
  @ApiResponse({ status: 200, description: 'نتیجهٔ استعلام ظرفیت' })
  @ApiForbiddenResponse({ description: 'Scope کلاینت شامل AVAILABILITY نیست.' })
  @ApiNotFoundResponse({ description: 'کلاینت یا پرواز یافت نشد.' })
  async testAvailability(
    @Param('id') id: string,
    @Body() dto: TestAvailabilityDto,
  ) {
    return {
      success: true,
      data: await this.webservices.testAvailability(id, dto.flightNo),
    };
  }
}
