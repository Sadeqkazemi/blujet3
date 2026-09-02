import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CareersService, RESUME_MAX_BYTES } from './careers.service';
import { ApplyJobDto } from './dto/careers.dtos';

/** Public, no-login careers listing + application submission. Separate
 * controller so CareersController's class-level JwtAuthGuard never
 * applies here. See docs/API.md's Phase 67. */
@ApiTags('careers')
@Controller('careers')
export class CareersPublicController {
  constructor(private readonly careers: CareersService) {}

  @Get('settings')
  @ApiOperation({ summary: 'وضعیت انتشار لینک فرصت‌های شغلی' })
  async getSettings() {
    return { success: true, data: await this.careers.getSettings() };
  }

  @Get('jobs')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'فهرست فرصت‌های شغلی فعال' })
  async listActiveJobs() {
    return { success: true, data: await this.careers.listActiveJobs() };
  }

  @Get('jobs/:id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'جزئیات یک فرصت شغلی' })
  async getPublicJob(@Param('id') id: string) {
    return { success: true, data: await this.careers.getPublicJob(id) };
  }

  @Get('media/:fileId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'تصویر آگهی فرصت شغلی (عمومی)' })
  async readMedia(@Param('fileId') fileId: string, @Res() res: Response) {
    const { mimeType, fileName, stream } =
      await this.careers.readPublicMedia(fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.pipe(res);
  }

  @Post('jobs/:id/apply')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'ثبت درخواست استخدام برای یک فرصت شغلی' })
  @ApiConsumes('multipart/form-data')
  // limits.fileSize would make multer throw its own error shape — the size
  // cap is enforced in the service so the envelope/message stay ours.
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: RESUME_MAX_BYTES + 1024 },
    }),
  )
  async apply(
    @Param('id') id: string,
    @Body() dto: ApplyJobDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return { success: true, data: await this.careers.apply(id, dto, file) };
  }
}
