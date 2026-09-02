import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SettingsService, type PublicContentLocale } from './settings.service';

/** Unauthenticated read endpoints for public-site chrome. */
@ApiTags('settings')
@Controller('settings')
export class SettingsPublicController {
  constructor(private readonly settings: SettingsService) {}

  @Get('social-links')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'لینک‌های فعال شبکه‌های اجتماعی برای فوتر سایت',
  })
  async getSocialLinks() {
    return { success: true, data: await this.settings.getPublicSocialLinks() };
  }

  @Get('app-links')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'لینک‌های دانلود اپلیکیشن برای صفحهٔ اصلی' })
  async getAppLinks() {
    return { success: true, data: await this.settings.getPublicAppLinks() };
  }

  @Get('support-contact')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'تلفن و ایمیل پشتیبانی نمایش‌داده‌شده در سایت' })
  async getSupportContact() {
    return {
      success: true,
      data: await this.settings.getPublicSupportContact(),
    };
  }

  @Get('site-content')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'متن صفحات عمومی ثابت (درباره ما، قوانین، …)' })
  @ApiQuery({ name: 'locale', required: false, enum: ['fa', 'en', 'ar'] })
  async getSiteContent(@Query('locale') locale?: PublicContentLocale) {
    const loc =
      locale === 'en' || locale === 'ar' || locale === 'fa' ? locale : 'fa';
    return {
      success: true,
      data: await this.settings.getPublicSiteContent(loc),
    };
  }

  @Get('site-rules/public')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'قوانین منتشرشده برای صفحهٔ عمومی سایت' })
  @ApiQuery({ name: 'locale', required: false, enum: ['fa', 'en', 'ar'] })
  async getSiteRules(@Query('locale') locale?: PublicContentLocale) {
    const loc =
      locale === 'en' || locale === 'ar' || locale === 'fa' ? locale : 'fa';
    return {
      success: true,
      data: await this.settings.getPublicSiteRules(loc),
    };
  }
}
