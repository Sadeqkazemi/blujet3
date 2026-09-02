import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SiteContentService } from './site-content.service';

@ApiTags('site-content')
@Controller('site-content')
export class SiteContentPublicController {
  constructor(private readonly content: SiteContentService) {}

  @Get('home')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'محتوای CMS صفحهٔ اصلی' })
  @ApiQuery({ name: 'locale', required: false, enum: ['fa', 'en', 'ar'] })
  async home(@Query('locale') locale?: string) {
    const loc =
      locale === 'en' || locale === 'ar' || locale === 'fa' ? locale : 'fa';
    return { success: true, data: await this.content.getPublicHome(loc) };
  }

  @Get('destination-stats')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'آمار مقاصد فعال داخلی/بین‌المللی از کاتالوگ فرودگاه و پروازهای منتشرشده',
  })
  async destinationStats() {
    return { success: true, data: await this.content.getDestinationStats() };
  }

  @Get('media/:fileId')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({ summary: 'دریافت تصویر محتوای سایت' })
  async media(@Param('fileId') fileId: string, @Res() res: Response) {
    const { mimeType, fileName, stream } =
      await this.content.readPublicMedia(fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.pipe(res);
  }
}
