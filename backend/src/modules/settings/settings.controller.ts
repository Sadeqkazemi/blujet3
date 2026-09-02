import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SITE_RULE_IDS } from './settings.service';

export class UpdateSettingsDto {
  @ApiProperty({
    description: 'Partial key-value patch — unknown keys are rejected',
    example: { maintenance: true },
  })
  @IsObject()
  patch: Record<string, unknown>;
}

export class RefundRuleUpdate {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  penaltyPct: number;
}

export class UpdateRefundRulesDto {
  @ApiProperty({ type: [RefundRuleUpdate] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundRuleUpdate)
  rules: RefundRuleUpdate[];
}

export class SiteRuleCategoryDto {
  @ApiProperty({ enum: SITE_RULE_IDS })
  @IsIn(SITE_RULE_IDS)
  id!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ maxLength: 12000 })
  @IsString()
  @MaxLength(12000)
  text!: string;
}

export class UpdateSiteRulesDto {
  @ApiProperty({ type: [SiteRuleCategoryDto] })
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => SiteRuleCategoryDto)
  categories!: SiteRuleCategoryDto[];
}

@ApiTags('settings')
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('IT_MANAGER', 'SITE_ADMIN')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'تنظیمات سامانه + بازه‌های واقعی جریمهٔ استرداد (فاز ۷)',
  })
  async getAll() {
    return { success: true, data: await this.settings.getAll() };
  }

  @Patch()
  @ApiOperation({
    summary: 'به‌روزرسانی تنظیمات — کلیدهای ناشناخته رد می‌شوند',
  })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    return {
      success: true,
      data: await this.settings.update(actor, dto.patch),
    };
  }

  @Get('site-rules')
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'دریافت هفت دستهٔ قابل‌ویرایش قوانین سایت' })
  async getSiteRules() {
    return { success: true, data: await this.settings.getSiteRules() };
  }

  @Patch('site-rules')
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'ذخیره و انتشار دسته‌های قوانین سایت' })
  async updateSiteRules(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateSiteRulesDto,
  ) {
    return {
      success: true,
      data: await this.settings.updateSiteRules(actor, dto),
    };
  }

  @Patch('refund-rules')
  @Roles('IT_MANAGER')
  @ApiOperation({
    summary:
      'تغییر درصد جریمهٔ بازه‌های واقعی استرداد — همان جدولی که موتور فاز ۷ می‌خواند',
  })
  async updateRefundRules(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateRefundRulesDto,
  ) {
    return {
      success: true,
      data: await this.settings.updateRefundRules(actor, dto.rules),
    };
  }
}
