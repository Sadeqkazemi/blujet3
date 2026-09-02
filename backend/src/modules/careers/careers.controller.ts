import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CareersService } from './careers.service';
import {
  CreateJobPostingDto,
  ListApplicationsQueryDto,
  ReferApplicationDto,
  UpdateCareersSettingsDto,
  UpdateJobPostingDto,
} from './dto/careers.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** فرصت‌های شغلی — SITE_ADMIN posting CRUD + application review
 * (`jobapps` panel tab). Public listing/apply lives in
 * CareersPublicController — no guards there. See docs/API.md's Phase 67. */
@ApiTags('careers')
@Controller('careers')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard)
@Roles('SITE_ADMIN')
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Patch('settings')
  @ApiOperation({ summary: 'فعال/غیرفعال کردن لینک فرصت‌های شغلی در فوتر' })
  async updateSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCareersSettingsDto,
  ) {
    return {
      success: true,
      data: await this.careers.updateSettings(actor, dto),
    };
  }

  @Get('postings')
  @ApiOperation({ summary: 'فهرست همهٔ فرصت‌های شغلی (فعال و غیرفعال)' })
  async listAllPostings() {
    return { success: true, data: await this.careers.listAllPostings() };
  }

  @Post('postings')
  @ApiOperation({ summary: 'ایجاد فرصت شغلی جدید' })
  async createPosting(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateJobPostingDto,
  ) {
    return {
      success: true,
      data: await this.careers.createPosting(actor, dto),
    };
  }

  @Patch('postings/:id')
  @ApiOperation({ summary: 'ویرایش یا فعال/غیرفعال‌سازی فرصت شغلی' })
  async updatePosting(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobPostingDto,
  ) {
    return {
      success: true,
      data: await this.careers.updatePosting(actor, id, dto),
    };
  }

  @Get('applications')
  @ApiOperation({ summary: 'فهرست درخواست‌های استخدام' })
  async listApplications(@Query() query: ListApplicationsQueryDto) {
    return { success: true, data: await this.careers.listApplications(query) };
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'جزئیات یک درخواست استخدام' })
  async getApplicationDetail(@Param('id') id: string) {
    return {
      success: true,
      data: await this.careers.getApplicationDetail(id),
    };
  }

  @Get('applications/:id/resume')
  @ApiOperation({ summary: 'دریافت فایل رزومهٔ درخواست' })
  async getResume(@Param('id') id: string, @Res() res: Response) {
    const { fileName, mimeType, stream } = await this.careers.getResume(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.pipe(res);
  }

  @Patch('applications/:id/refer')
  @ApiOperation({ summary: 'ارجاع درخواست استخدام به یکی از مدیران' })
  async referApplication(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReferApplicationDto,
  ) {
    return {
      success: true,
      data: await this.careers.referApplication(actor, id, dto),
    };
  }

  @Patch('applications/:id/hire')
  @ApiOperation({ summary: 'پذیرش (استخدام) متقاضی' })
  async hireApplication(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.careers.hireApplication(actor, id),
    };
  }

  @Patch('applications/:id/reject')
  @ApiOperation({ summary: 'رد درخواست متقاضی' })
  async rejectApplication(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.careers.rejectApplication(actor, id),
    };
  }
}
